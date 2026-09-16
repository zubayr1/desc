use anchor_lang::prelude::*;

use crate::error::ModerationError;

/// A registered moderator (PDA, seeds = [b"moderator", authority]).
///
/// One per moderator wallet. Holds the mod's signing identity, its public
/// encryption key (so the *chain* is the source of truth for what committers
/// seal deliverables to), and an active flag the mod controls itself.
///
/// V1: registered by the platform admin (internal mods). V2: permissionless
/// registration gated by stake — those fields are carved from `reserved`.
///
/// Backward-compat discipline: `version` first, `reserved` LAST (see
/// `ModerationConfig`).
#[account]
#[derive(InitSpace)]
pub struct Moderator {
    /// Schema version of this account. Set to `VERSION` at init.
    pub version: u8,
    /// The `ModerationConfig` this moderator is registered under. Bound at
    /// registration so a verdict can't be signed under a different config.
    pub config: Pubkey,
    /// The moderator's own non-custodial wallet. Signs `set_moderator_active`
    /// and `submit_verdict`. Also part of the PDA seed.
    pub authority: Pubkey,
    /// Public `age` recipient (e.g. `age1...`) — what committers encrypt
    /// deliverables to. On-chain so nobody can swap a mod's key.
    #[max_len(64)]
    pub recipient: String,
    /// Human-readable label (platform-set).
    #[max_len(64)]
    pub label: String,
    /// Whether this mod may currently judge. Toggled by the mod itself.
    pub active: bool,
    /// Unix timestamp of registration.
    pub registered_at: i64,
    pub bump: u8,

    // --- Pricing, set by the moderator itself -------------------------------
    // A moderator quotes its own price; the escrow snapshots it at creation.
    // Nobody who PAYS the fee gets to set it:
    //
    //   fee = amount * base_bps / 10_000  +  fee_per_kb * bundle_kb
    //
    // `desc_escrow` reads these raw at `create_escrow` (it cannot import this
    // type — this program already depends on the escrow crate), so the field
    // ORDER below is part of that contract: change it and escrow mis-reads.
    /// Share of the contract amount, in basis points (100 = 1%).
    pub base_bps: u16,
    /// Per-KB of deliverable text. V2 — must be 0 until size pricing ships.
    pub fee_per_kb: u64,
    /// Largest deliverable this moderator will judge, in KB. 0 = no limit.
    /// V2 — must be 0 until size pricing ships.
    pub max_bundle_kb: u32,

    /// Forward-compat padding (V2: stake, reputation, …). Keep it LAST.
    pub reserved: [u8; 50],
}

impl Moderator {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, authority].
    pub const SEED_PREFIX: &'static [u8] = b"moderator";

    /// Ceiling on `base_bps` (500 = 5%). Stops a fat-fingered price from making
    /// verification cost more than the work being verified.
    pub const MAX_BASE_BPS: u16 = 500;

    /// Validate a price before it is written. Shared by registration and
    /// `update_moderator_pricing` so the two can never disagree.
    pub fn validate_pricing(base_bps: u16, fee_per_kb: u64, max_bundle_kb: u32) -> Result<()> {
        require!(
            base_bps <= Self::MAX_BASE_BPS,
            ModerationError::BaseBpsTooHigh
        );
        // A per-KB price with no size limit has no ceiling: the escrow could
        // never know how much to lock up front, and the real fee could exceed
        // the deposit.
        require!(
            fee_per_kb == 0 || max_bundle_kb > 0,
            ModerationError::SizePricingWithoutLimit
        );
        Ok(())
    }
}
