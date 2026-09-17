use anchor_lang::prelude::*;

use crate::states::Moderator;

/// A moderator sets its own price. Signed by the moderator's wallet, never the
/// admin — the price belongs to whoever does the work.
///
/// Changing the price does not touch escrows already created: each one
/// snapshotted the price in force at `create_escrow`.
#[derive(Accounts)]
pub struct UpdateModeratorPricing<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Moderator::SEED_PREFIX, authority.key().as_ref()],
        bump = moderator.bump,
        has_one = authority,
    )]
    pub moderator: Account<'info, Moderator>,
}

impl<'info> UpdateModeratorPricing<'info> {
    pub fn update_moderator_pricing(
        &mut self,
        base_bps: u16,
        fee_per_kb: u64,
        max_bundle_kb: u32,
    ) -> Result<()> {
        Moderator::validate_pricing(base_bps, fee_per_kb, max_bundle_kb)?;
        self.moderator.base_bps = base_bps;
        self.moderator.fee_per_kb = fee_per_kb;
        self.moderator.max_bundle_kb = max_bundle_kb;
        Ok(())
    }
}
