use anchor_lang::prelude::*;

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
    /// Forward-compat padding (V2: stake, reputation, …). Keep it LAST.
    pub reserved: [u8; 64],
}

impl Moderator {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, authority].
    pub const SEED_PREFIX: &'static [u8] = b"moderator";
}
