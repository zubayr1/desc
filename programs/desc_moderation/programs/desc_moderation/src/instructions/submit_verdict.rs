use anchor_lang::prelude::*;

use crate::error::ModerationError;
use crate::states::{ModerationConfig, Moderator};
use desc_escrow::program::DescEscrow;
use desc_escrow::states::{Config as EscrowConfig, Escrow, Outcome, Panel};

/// A registered, active moderator records its verdict for a submitted escrow.
///
/// The moderator signs with its OWN wallet; this checks it is registered and
/// active, then CPIs `desc_escrow::record_verdict` signing as the
/// `[b"authority", config]` PDA — the escrow's `settlement_authority`. No
/// central key signs: the moderator authorizes itself, the program is a bridge.
///
/// Panel consensus is decided on the escrow's `Panel`, not here.
#[derive(Accounts)]
pub struct SubmitVerdict<'info> {
    /// The moderator's own wallet.
    pub authority: Signer<'info>,

    /// Authenticated via the moderator's `has_one = config`.
    pub config: Account<'info, ModerationConfig>,

    /// The escrow's settlement authority. Signs the CPI; holds no data.
    /// CHECK: PDA validated by seeds; used only as a CPI signer.
    #[account(
        seeds = [ModerationConfig::AUTHORITY_SEED_PREFIX, config.key().as_ref()],
        bump = config.authority_bump,
    )]
    pub verdict_authority: UncheckedAccount<'info>,

    /// Must be active and bound to `config` + signer.
    #[account(
        seeds = [Moderator::SEED_PREFIX, authority.key().as_ref()],
        bump = moderator.bump,
        has_one = config,
        constraint = moderator.active @ ModerationError::Unauthorized,
    )]
    pub moderator: Account<'info, Moderator>,

    /// Its `settlement_authority` must equal `verdict_authority` — enforced
    /// inside `record_verdict`.
    pub escrow_config: Account<'info, EscrowConfig>,

    #[account(mut)]
    pub escrow: Box<Account<'info, Escrow>>,

    /// The escrow program checks the seat and tallies; this only forwards it.
    #[account(mut)]
    pub panel: Box<Account<'info, Panel>>,

    #[account(constraint = config.escrow_program == desc_escrow_program.key() @ ModerationError::Unauthorized)]
    pub desc_escrow_program: Program<'info, DescEscrow>,
}

impl<'info> SubmitVerdict<'info> {
    pub fn submit_verdict(&self, outcome: Outcome, verdict_hash: [u8; 32]) -> Result<()> {
        let config_key = self.config.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            ModerationConfig::AUTHORITY_SEED_PREFIX,
            config_key.as_ref(),
            &[self.config.authority_bump],
        ]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.desc_escrow_program.to_account_info(),
            desc_escrow::cpi::accounts::RecordVerdict {
                settlement_authority: self.verdict_authority.to_account_info(),
                config: self.escrow_config.to_account_info(),
                escrow: self.escrow.to_account_info(),
                panel: self.panel.to_account_info(),
            },
            signer_seeds,
        );

        // The escrow seats it, counts the vote, and pays it on settle.
        desc_escrow::cpi::record_verdict(cpi_ctx, outcome, verdict_hash, self.authority.key())
    }
}
