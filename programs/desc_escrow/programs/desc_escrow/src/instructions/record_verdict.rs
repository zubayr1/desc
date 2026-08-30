use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, Outcome};

/// The settlement authority attests a moderator's verdict for a submitted
/// escrow. Attestation only — no money moves; the parties then execute
/// `release` (Pass) or `refund` (Fail) themselves.
///
/// The authority is read LIVE from the bound `Config` (via `escrow.config`), so
/// it stays rotatable. Today it is the `desc_moderation` verdict PDA, which
/// invokes this by CPI — there is no platform keypair that can reach it. V2
/// widens who may drive that PDA (k-of-n consensus); this instruction is
/// unchanged by that.
#[derive(Accounts)]
pub struct RecordVerdict<'info> {
    pub settlement_authority: Signer<'info>,

    #[account(has_one = settlement_authority)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = config,
    )]
    pub escrow: Account<'info, Escrow>,
}

impl<'info> RecordVerdict<'info> {
    pub fn record_verdict(
        &mut self,
        outcome: Outcome,
        verdict_hash: [u8; 32],
        moderator: Pubkey,
    ) -> Result<()> {
        require!(
            self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        // One-shot: a verdict is final and can't be re-recorded.
        require!(self.escrow.outcome.is_none(), EscrowError::InvalidStatus);

        self.escrow.outcome = Some(outcome);
        self.escrow.verdict_hash = verdict_hash;
        self.escrow.moderator = moderator;

        Ok(())
    }
}
