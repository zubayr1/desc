use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, Outcome};

/// Pay out a passed escrow. Signed by EITHER party (initiator or committer), so
/// the payout never depends on any one party — or the settlement authority —
/// being online once the verdict is recorded (the liveness guarantee).
///
/// Requires `Submitted` + `outcome == Pass`. Pays `amount` to the committer,
/// `protocol_fee` to the treasury, and the `moderator_surcharge` (the 1% reward)
/// to the moderator that judged it, then closes the vault (rent -> initiator) and
/// marks the escrow `Settled`.
///
/// On a no-mod escrow there is no moderator and no surcharge, so the moderator
/// token account is omitted.
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
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    #[account(has_one = treasury)]
    pub config: Box<Account<'info, Config>>,

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

    /// The judging moderator's USDC account — receives the surcharge (its reward).
    /// Bound to the moderator that `record_verdict` stored. Omit on a no-mod
    /// escrow, where nobody judged and there is no surcharge to pay.
    #[account(
        mut,
        constraint = moderator_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub moderator_token_account: Option<Box<Account<'info, TokenAccount>>>,

    /// Initiator — receives the vault's rent on close.
    #[account(mut)]
    pub initiator: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Release<'info> {
    pub fn release(&mut self) -> Result<()> {
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

        // Moderator surcharge (the 1% reward) to the judging moderator. Zero on a
        // no-mod escrow, where the account is absent entirely.
        if self.escrow.moderator_surcharge > 0 {
            let mod_token = self
                .moderator_token_account
                .as_ref()
                .ok_or(EscrowError::Unauthorized)?;
            require!(
                mod_token.owner == self.escrow.moderator,
                EscrowError::Unauthorized
            );
            transfer(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    Transfer {
                        from: self.vault.to_account_info(),
                        to: mod_token.to_account_info(),
                        authority: self.escrow.to_account_info(),
                    },
                    signer_seeds,
                ),
                self.escrow.moderator_surcharge,
            )?;
        }

        // Close the drained vault, rent back to the initiator.
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
