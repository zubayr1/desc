use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::spl_token::state::Account as SplTokenAccount;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, Outcome, Panel, VOTE_NONE};

/// Pay out a passed escrow. Signed by EITHER party (initiator or committer), so
/// the payout never depends on any one party — or the settlement authority —
/// being online once the verdict is recorded (the liveness guarantee).
///
/// Requires `Submitted` + `outcome == Pass`. Pays `amount` to the committer,
/// `protocol_fee` to the treasury, and every moderator THAT VOTED its own
/// snapshotted fee, then returns any unspent moderator fee to the initiator,
/// closes the vault and the panel (both rents -> initiator) and marks the escrow
/// `Settled`.
///
/// Moderator fees are priced per moderator, not split: each one ran the whole
/// check, so each earns a full fee and the panel's fees sum to
/// `moderator_surcharge`. A moderator that never voted is not paid and its fee
/// goes back to the initiator — hence `initiator_token_account`, which a
/// single-moderator release never needed.
///
/// The voting moderators' token accounts arrive as `remaining_accounts`: one per
/// VOTED seat, in panel order (see `pay_panel`). A no-mod escrow has an empty
/// panel and passes none.
#[derive(Accounts)]
pub struct Release<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = config,
        has_one = vault,
        has_one = initiator,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    #[account(has_one = treasury)]
    pub config: Box<Account<'info, Config>>,

    /// The escrow's panel — who judged it, how they voted, and what each is
    /// owed. Closed here, rent back to the INITIATOR: they put it up at
    /// creation, and `release` may be signed by either party, so the signer must
    /// never be the destination.
    ///
    /// Boxed, like every other sizeable account here — see the stack warning in
    /// `create_escrow`.
    #[account(
        mut,
        close = initiator,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,

    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Committer's USDC account — receives the payout.
    #[account(
        mut,
        constraint = committer_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub committer_token_account: Box<Account<'info, TokenAccount>>,

    /// Protocol treasury token account — receives the protocol fee.
    #[account(
        mut,
        constraint = treasury.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub treasury: Box<Account<'info, TokenAccount>>,

    /// Initiator's USDC account — receives the fees of any moderator that did
    /// not vote. Required even when every moderator voted (nothing is sent then)
    /// so the vault can always be drained to zero and closed.
    #[account(
        mut,
        constraint = initiator_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
        constraint = initiator_token_account.owner == escrow.initiator @ EscrowError::Unauthorized,
    )]
    pub initiator_token_account: Box<Account<'info, TokenAccount>>,

    /// Initiator — receives the vault's and the panel's rent on close.
    #[account(mut)]
    pub initiator: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Release<'info> {
    pub fn release(&mut self, moderator_token_accounts: &[AccountInfo<'info>]) -> Result<()> {
        // A stale program reading a newer account decodes silently and wrongly.
        self.escrow.check_version()?;
        self.config.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        require!(
            self.escrow.outcome == Some(Outcome::Pass),
            EscrowError::InvalidStatus
        );

        // Either party may execute the payout.
        let signer = self.signer.key();
        require!(
            signer == self.escrow.initiator || Some(signer) == self.escrow.committer,
            EscrowError::Unauthorized
        );
        // The payout must land in the bound committer's account.
        require!(
            self.escrow.committer == Some(self.committer_token_account.owner),
            EscrowError::Unauthorized
        );

        // Escrow PDA signs for its own vault.
        let initiator_key = self.escrow.initiator;
        let contract_id = self.escrow.contract_id;
        let bump = self.escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            Escrow::SEED_PREFIX,
            initiator_key.as_ref(),
            contract_id.as_ref(),
            &[bump],
        ]];

        // Payout to the committer.
        transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.vault.to_account_info(),
                    to: self.committer_token_account.to_account_info(),
                    authority: self.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            self.escrow.amount,
        )?;

        // Protocol fee to the treasury.
        if self.escrow.protocol_fee > 0 {
            transfer(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    Transfer {
                        from: self.vault.to_account_info(),
                        to: self.treasury.to_account_info(),
                        authority: self.escrow.to_account_info(),
                    },
                    signer_seeds,
                ),
                self.escrow.protocol_fee,
            )?;
        }

        // Every moderator that voted, its own fee. Empty on a no-mod escrow.
        let paid = pay_panel(
            &self.panel,
            &self.escrow,
            moderator_token_accounts,
            self.vault.to_account_info(),
            self.escrow.to_account_info(),
            self.token_program.to_account_info(),
            signer_seeds,
        )?;

        // Whatever the initiator locked for moderators who never voted comes
        // back to them. Also drains the vault so it can be closed.
        let unspent = self
            .escrow
            .moderator_surcharge
            .checked_sub(paid)
            .ok_or(EscrowError::MathOverflow)?;
        if unspent > 0 {
            transfer(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    Transfer {
                        from: self.vault.to_account_info(),
                        to: self.initiator_token_account.to_account_info(),
                        authority: self.escrow.to_account_info(),
                    },
                    signer_seeds,
                ),
                unspent,
            )?;
        }

        // Close the drained vault, rent back to the initiator. The panel account
        // is closed by its `close = initiator` constraint.
        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.vault.to_account_info(),
                destination: self.initiator.to_account_info(),
                authority: self.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        self.escrow.status = EscrowStatus::Settled;

        Ok(())
    }
}

/// Pay every moderator that voted its own snapshotted fee, and return the total
/// paid. Shared by `release` (Pass) and `refund` (Fail): a moderator is paid for
/// rendering a verdict, not for the verdict going one way — including one that
/// was outvoted, or one whose vote landed after the majority had already
/// decided, since both did the same work.
///
/// `token_accounts` holds one account per VOTED seat, in panel order, and
/// nothing for seats that never voted. Each is checked to be a real token
/// account of the escrow's mint OWNED BY that seat's moderator, so a caller
/// cannot redirect another moderator's fee to itself.
pub fn pay_panel<'info>(
    panel: &Panel,
    escrow: &Escrow,
    token_accounts: &[AccountInfo<'info>],
    vault: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<u64> {
    let count = panel.count as usize;
    let voters = panel.entries[..count]
        .iter()
        .filter(|e| e.vote != VOTE_NONE);
    require!(
        token_accounts.len() == voters.clone().count(),
        EscrowError::ModeratorConfigMismatch
    );

    let mut paid: u64 = 0;
    for (entry, token_account) in voters.zip(token_accounts) {
        // Unpacked by hand rather than through `Account<TokenAccount>`: read the
        // two fields that matter and drop the borrow, so nothing large is held
        // across the transfer and the token program can take its own mutable
        // borrow of this account.
        require!(
            token_account.owner == &anchor_spl::token::ID,
            EscrowError::Unauthorized
        );
        let (mint, wallet) = {
            let data = token_account.try_borrow_data()?;
            let parsed = SplTokenAccount::unpack(&data)?;
            (parsed.mint, parsed.owner)
        };
        require!(mint == escrow.mint, EscrowError::Unauthorized);
        require!(wallet == entry.moderator, EscrowError::Unauthorized);

        if entry.fee > 0 {
            transfer(
                CpiContext::new_with_signer(
                    token_program.clone(),
                    Transfer {
                        from: vault.clone(),
                        to: token_account.clone(),
                        authority: authority.clone(),
                    },
                    signer_seeds,
                ),
                entry.fee,
            )?;
        }
        paid = paid
            .checked_add(entry.fee)
            .ok_or(EscrowError::MathOverflow)?;
    }

    Ok(paid)
}
