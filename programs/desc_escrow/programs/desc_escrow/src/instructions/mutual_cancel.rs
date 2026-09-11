use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus};

/// Both parties agree to call off an in-flight deal. Requires signatures from
/// BOTH the initiator and the bound committer. Allowed from `Active` or
/// `Submitted` — the clean bail-out that skips the ghost-timeout wait and the
/// forced-fail path. Full vault returns to the initiator -> `Refunded`.
#[derive(Accounts)]
pub struct MutualCancel<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    pub committer: Signer<'info>,

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

impl<'info> MutualCancel<'info> {
    pub fn mutual_cancel(&mut self) -> Result<()> {
        // A stale program reading a newer account decodes silently and wrongly.
        self.escrow.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Active
                || self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        // The co-signer must be the bound committer.
        require!(
            self.escrow.committer == Some(self.committer.key()),
            EscrowError::Unauthorized
        );

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

        // Return the full deposit to the initiator.
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
