use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus, Outcome};

/// Initiator reclaims the deposit. Fires on either trigger:
///   1. `Active` & past deadline with no submission  -> committer ghosted, or
///   2. `Submitted` & `outcome == Fail`              -> work rejected.
///
/// Payout policy:
/// - Ghost-timeout (no verdict): the ENTIRE vault returns to the initiator — a
///   deal where no moderator did any work shouldn't cost them anything.
/// - Fail verdict (a moderator judged): the moderator earns its `surcharge`
///   (pay-on-any-verdict); the rest (amount + protocol fee) returns to the
///   initiator. The protocol fee is waived back to the initiator on a failed deal.
/// Vault is closed; escrow kept as a `Refunded` record.
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, initiator.key().as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = initiator,
        has_one = vault,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    /// Refund destination — the initiator's USDC account.
    #[account(
        mut,
        constraint = initiator_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
        constraint = initiator_token_account.owner == initiator.key() @ EscrowError::Unauthorized,
    )]
    pub initiator_token_account: Account<'info, TokenAccount>,

    /// On a Fail verdict, the judging moderator's USDC account — receives the
    /// surcharge. Omit on a ghost-timeout (no verdict, no moderator paid).
    #[account(
        mut,
        constraint = moderator_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub moderator_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Refund<'info> {
    pub fn refund(&mut self) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        let ghosted =
            self.escrow.status == EscrowStatus::Active && now > self.escrow.deadline;
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

        // On a Fail verdict, the moderator that judged earns its surcharge; the
        // rest goes back to the initiator. On a ghost-timeout the full vault does.
        let to_initiator = if failed {
            let surcharge = self.escrow.moderator_surcharge;
            if surcharge > 0 {
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
                    surcharge,
                )?;
            }
            total.checked_sub(surcharge).ok_or(EscrowError::MathOverflow)?
        } else {
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

        // Close the now-empty vault, rent back to the initiator.
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
