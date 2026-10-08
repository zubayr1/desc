use anchor_lang::prelude::*;

use crate::error::ModerationError;

/// A registered moderator (PDA, seeds = [b"moderator", authority]).
///
/// One per moderator wallet: its signing identity, its public encryption key
/// (so the CHAIN decides what committers seal deliverables to), and an active
/// flag the moderator controls itself.
///
/// Registered by the platform admin today; permissionless stake-gated
/// registration is V2, carved from `reserved`.
#[account]
#[derive(InitSpace)]
pub struct Moderator {
    pub version: u8,
    /// Bound at registration, so a verdict cannot be signed under a different
    /// config.
    pub config: Pubkey,
    /// The moderator's own wallet. Signs `set_moderator_active` and
    /// `submit_verdict`. Also part of the PDA seed.
    pub authority: Pubkey,
    /// Public `age` recipient. On-chain so nobody can swap a moderator's key.
    #[max_len(64)]
    pub recipient: String,
    #[max_len(64)]
    pub label: String,
    /// Toggled by the moderator itself.
    pub active: bool,
    pub registered_at: i64,
    pub bump: u8,

    // Pricing, quoted by the moderator itself — nobody who PAYS the fee sets it:
    //
    //   fee = amount * base_bps / 10_000  +  fee_per_kb * bundle_kb
    //
    // `desc_escrow` reads these RAW at `create_escrow` (it cannot import this
    // type — this program already depends on that crate), so the field ORDER
    // below is part of that contract: change it and escrow mis-reads.
    pub base_bps: u16,
    /// Must be 0 until size pricing ships.
    pub fee_per_kb: u64,
    /// 0 = no limit. Must be 0 until size pricing ships.
    pub max_bundle_kb: u32,
    /// Read raw by `desc_escrow` — keep it directly after the pricing fields.
    pub is_tiebreaker: bool,

    /// V2: stake, slashing history. Reputation lives in `desc_escrow`, which is
    /// where the outcome and the panel's votes are.
    pub reserved: [u8; 49],
}

impl Moderator {
    pub const VERSION: u8 = 2;

    /// Seed prefix; full seeds = [SEED_PREFIX, authority].
    pub const SEED_PREFIX: &'static [u8] = b"moderator";

    /// 5%. Stops a fat-fingered price costing more than the work being verified.
    pub const MAX_BASE_BPS: u16 = 500;

    /// Shared by registration and `update_moderator_pricing`, so the two can
    /// never disagree.
    pub fn validate_pricing(base_bps: u16, fee_per_kb: u64, max_bundle_kb: u32) -> Result<()> {
        require!(
            base_bps <= Self::MAX_BASE_BPS,
            ModerationError::BaseBpsTooHigh
        );
        // Per-KB with no limit has no ceiling: the escrow could not know how
        // much to lock, and the fee could exceed the deposit.
        require!(
            fee_per_kb == 0 || max_bundle_kb > 0,
            ModerationError::SizePricingWithoutLimit
        );
        Ok(())
    }
}
