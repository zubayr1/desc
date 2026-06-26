use anchor_lang::prelude::*;

use crate::error::ModerationError;
use crate::states::{ModerationConfig, Moderator};
use desc_escrow::program::DescEscrow;
use desc_escrow::states::{Config as EscrowConfig, Escrow, Outcome};

/// A registered, active moderator records its verdict for a submitted escrow.
///
/// The mod signs with its OWN wallet; this checks it's a registered active
/// moderator, then CPIs `desc_escrow::record_verdict` signing as the
/// `[b"authority", config]` PDA — which is the escrow's `settlement_authority`.
/// No central key signs: the mod authorizes itself, the program is the bridge.
///
/// V1 settles on a single verdict (`min_verdicts == 1`); k-of-n aggregation is V2.
#[derive(Accounts)]
pub struct SubmitVerdict<'info> {
    /// The moderator's own wallet.
    pub authority: Signer<'info>,

    /// The moderation config the mod is registered under (authenticated via the
    /// moderator's `has_one = config`).
    pub config: Account<'info, ModerationConfig>,

    /// The `[b"authority", config]` signer PDA = the escrow's settlement
    /// authority. Signs the CPI; holds no data.
    /// CHECK: PDA validated by seeds; used only as a CPI signer.
    #[account(
        seeds = [ModerationConfig::AUTHORITY_SEED_PREFIX, config.key().as_ref()],
        bump = config.authority_bump,
    )]
    pub verdict_authority: UncheckedAccount<'info>,

    /// The registered moderator — must be active and bound to `config` + signer.
    #[account(
        seeds = [Moderator::SEED_PREFIX, authority.key().as_ref()],
        bump = moderator.bump,
        has_one = config,
        constraint = moderator.active @ ModerationError::Unauthorized,
    )]
    pub moderator: Account<'info, Moderator>,

    /// The escrow's protocol config. Its `settlement_authority` must equal
    /// `verdict_authority` — enforced inside `record_verdict`.
    pub escrow_config: Account<'info, EscrowConfig>,

    #[account(mut)]
    pub escrow: Account<'info, Escrow>,

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
            },
            signer_seeds,
        );

        // Pass the signing moderator through so the escrow can pay it the
        // surcharge on settle (release / refund).
        desc_escrow::cpi::record_verdict(cpi_ctx, outcome, verdict_hash, self.authority.key())
    }
}
