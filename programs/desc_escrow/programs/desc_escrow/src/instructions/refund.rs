use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::instructions::release::pay_panel;
use crate::states::{Config, Escrow, EscrowStatus, Outcome, Panel};

/// Initiator reclaims the deposit. Fires on either trigger:
///   1. `Active` & past deadline with no submission  -> committer ghosted, or
///   2. `Submitted` & `outcome == Fail`              -> work rejected.
///
/// Payout policy — the protocol is paid for *rendering a verdict*, not for the
/// verdict going one way:
/// - Ghost-timeout (no verdict): the ENTIRE vault returns to the initiator — a
///   deal where no moderator did any work shouldn't cost them anything.
/// - Fail verdict (the panel judged): every moderator that voted earns its own
///   snapshotted fee (pay-on-any-verdict) — including one that was outvoted,
///   since it did the same work — the treasury keeps the `verification_fee` as
///   cost recovery for the verification that actually ran, and everything else
///   (amount, the rest of the protocol fee, and the fees of any moderator that
///   never voted) returns to the initiator.
///
/// So the protocol never *profits* from a failed deal, and is never paid to
/// *pass* one either. `verification_fee` is zero when no fee floor is configured
/// and for escrows created before the field existed, which reproduces the older
/// fee-on-Pass-only behaviour exactly.
///
/// The voting moderators' token accounts arrive as `remaining_accounts`: one per
/// VOTED seat, in panel order (see `pay_panel`). A ghost-timeout pays nobody and
/// passes none.
///
/// Vault and panel are closed (both rents -> initiator); escrow kept as a
/// `Refunded` record.
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, initiator.key().as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = config,
        has_one = initiator,
        has_one = vault,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// Bound via `escrow.config` — supplies the treasury the verification fee
    /// goes to (read live, like `release` does).
    #[account(has_one = treasury)]
    pub config: Box<Account<'info, Config>>,

    /// The escrow's panel — who judged it, how they voted, and what each is
    /// owed. Closed here, rent back to the initiator who put it up at creation.
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

    /// Refund destination — the initiator's USDC account.
    #[account(
        mut,
        constraint = initiator_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
        constraint = initiator_token_account.owner == initiator.key() @ EscrowError::Unauthorized,
    )]
    pub initiator_token_account: Box<Account<'info, TokenAccount>>,

    /// Protocol treasury token account — receives the verification fee on a Fail.
    /// Always required (it's bound by the config) even on a ghost-timeout, where
    /// nothing is transferred to it.
    #[account(
        mut,
        constraint = treasury.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub treasury: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Refund<'info> {
    pub fn refund(&mut self, moderator_token_accounts: &[AccountInfo<'info>]) -> Result<()> {
        // A stale program reading a newer account decodes silently and wrongly.
        self.escrow.check_version()?;
        self.config.check_version()?;
        let now = Clock::get()?.unix_timestamp;

        let ghosted = self.escrow.status == EscrowStatus::Active && now > self.escrow.deadline;
        let failed = self.escrow.status == EscrowStatus::Submitted
            && self.escrow.outcome == Some(Outcome::Fail);
        require!(ghosted || failed, EscrowError::InvalidStatus);

        // Escrow PDA signs for its own vault.
        let initiator_key = self.initiator.key();
        let contract_id = self.escrow.contract_id;
        let bump = self.escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            Escrow::SEED_PREFIX,
            initiator_key.as_ref(),
            contract_id.as_ref(),
            &[bump],
        ]];

        let total = self.vault.amount;

        // On a Fail verdict every moderator that voted earns its fee and the
        // treasury keeps the verification fee; the rest — including the fees of
        // any moderator that never voted — goes back to the initiator. On a
        // ghost-timeout the full vault does.
        let to_initiator = if failed {
            let paid = pay_panel(
                &self.panel,
                &self.escrow,
                moderator_token_accounts,
                self.vault.to_account_info(),
                self.escrow.to_account_info(),
                self.token_program.to_account_info(),
                signer_seeds,
            )?;

            // Cost recovery for the verification that ran. Clamped to the fee
            // actually escrowed so a legacy or malformed account can never take
            // more than the initiator deposited as fee.
            let verification_fee = self.escrow.verification_fee.min(self.escrow.protocol_fee);
            if verification_fee > 0 {
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
                    verification_fee,
                )?;
            }

            total
                .checked_sub(paid)
                .and_then(|v| v.checked_sub(verification_fee))
                .ok_or(EscrowError::MathOverflow)?
        } else {
            // Nobody judged a ghosted deal, so nobody is paid — a caller passing
            // moderator accounts here has misread the state.
            require!(
                moderator_token_accounts.is_empty(),
                EscrowError::ModeratorConfigMismatch
            );
            total
        };

        // Return the remaining deposit to the initiator.
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
            to_initiator,
        )?;

        // Close the now-empty vault, rent back to the initiator. The panel
        // account is closed by its `close = initiator` constraint.
        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.vault.to_account_info(),
                destination: self.initiator.to_account_info(),
                authority: self.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        self.escrow.status = EscrowStatus::Refunded;

        Ok(())
    }
}
