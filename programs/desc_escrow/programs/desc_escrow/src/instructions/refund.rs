use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus, Outcome};

/// Initiator reclaims the deposit. Fires on either trigger:
///   1. `Active` & past deadline with no submission  -> committer ghosted, or
///   2. `Submitted` & `outcome == Fail`              -> work rejected.
///
/// V1 policy: the ENTIRE vault (amount + fee + surcharge) returns to the
/// initiator — a deal that produced nothing accepted shouldn't cost them fees.
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

        // Return the full deposit.
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
            self.vault.amount,
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
