use anchor_lang::prelude::*;

use crate::error::ModerationError;
use crate::states::{ModerationConfig, Moderator};
use desc_escrow::program::DescEscrow;
use desc_escrow::states::{Config as EscrowConfig, Escrow, ModeratorReputation, Outcome, Panel};

/// The tiebreaker flag is enforced here; the escrow trusts the verdict-authority PDA.
#[derive(Accounts)]
pub struct SubmitTiebreak<'info> {
    pub authority: Signer<'info>,

    pub config: Account<'info, ModerationConfig>,

    /// CHECK: PDA validated by seeds; used only as a CPI signer.
    #[account(
        seeds = [ModerationConfig::AUTHORITY_SEED_PREFIX, config.key().as_ref()],
        bump = config.authority_bump,
    )]
    pub verdict_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [Moderator::SEED_PREFIX, authority.key().as_ref()],
        bump = moderator.bump,
        has_one = config,
        constraint = moderator.active @ ModerationError::Unauthorized,
        constraint = moderator.is_tiebreaker @ ModerationError::NotATiebreaker,
    )]
    pub moderator: Account<'info, Moderator>,

    pub escrow_config: Account<'info, EscrowConfig>,

    #[account(mut)]
    pub escrow: Box<Account<'info, Escrow>>,

    #[account(mut)]
    pub panel: Box<Account<'info, Panel>>,

    #[account(mut)]
    pub replaced_reputation: Box<Account<'info, ModeratorReputation>>,

    #[account(constraint = config.escrow_program == desc_escrow_program.key() @ ModerationError::Unauthorized)]
    pub desc_escrow_program: Program<'info, DescEscrow>,
}

impl<'info> SubmitTiebreak<'info> {
    pub fn submit_tiebreak(&self, outcome: Outcome, verdict_hash: [u8; 32]) -> Result<()> {
        let config_key = self.config.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            ModerationConfig::AUTHORITY_SEED_PREFIX,
            config_key.as_ref(),
            &[self.config.authority_bump],
        ]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.desc_escrow_program.to_account_info(),
            desc_escrow::cpi::accounts::RecordTiebreak {
                settlement_authority: self.verdict_authority.to_account_info(),
                config: self.escrow_config.to_account_info(),
                escrow: self.escrow.to_account_info(),
                panel: self.panel.to_account_info(),
                replaced_reputation: self.replaced_reputation.to_account_info(),
            },
            signer_seeds,
        );

        desc_escrow::cpi::record_tiebreak(cpi_ctx, outcome, verdict_hash, self.authority.key())
    }
}
