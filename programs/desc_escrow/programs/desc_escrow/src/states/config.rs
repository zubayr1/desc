use anchor_lang::prelude::*;

/// Global protocol config (PDA, seeds = [b"config", authority]).
///
/// Seeded with `authority` so the config is deterministic per-admin and not a
/// squattable global singleton. Holds protocol-level parameters so fees,
/// treasury, the settlement authority, and the kill-switch can change without
/// redeploying the program.
///
/// Note: because `authority` is part of the seed, the top-level admin cannot be
/// rotated in place (the PDA address would change). `settlement_authority` is a
/// field, not a seed, so it rotates freely — which is what the V1->V2 seam needs.
///
/// Backward-compat discipline:
/// - `version` is the first field (byte 8) for version dispatch / migrations.
/// - `reserved` is the LAST field. New fields are inserted immediately before
///   it and shrink it by their exact size, so the account size stays constant
///   (no `realloc`). Freed bytes are zeroed, so an added `Option<T>` reads None.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Schema version of this account. Set to `VERSION` at init.
    pub version: u8,
    /// Admin — may update this config. Also part of the PDA seed.
    pub authority: Pubkey,
    /// Key authorized to call `release` / `refund` on an escrow.
    ///
    /// V1: the platform backend key, acting on the off-chain aggregated verdict.
    /// V2: swapped (via `update_config`) to a PDA of the `desc_moderation`
    /// program, so on-chain moderator consensus settles escrows via CPI. The
    /// escrow accounts never change — this indirection is the V1->V2 seam.
    pub settlement_authority: Pubkey,
    /// Destination for the protocol fee.
    pub treasury: Pubkey,
    /// Base protocol fee in basis points (200 = 2%).
    pub protocol_fee_bps: u16,
    /// Global kill-switch — blocks new escrows / settlements when true.
    pub paused: bool,
    pub bump: u8,
    /// Forward-compat padding. Carve new fields from here.
    pub reserved: [u8; 64],
}

impl Config {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, authority].
    pub const SEED_PREFIX: &'static [u8] = b"config";

    /// Upper bound on the protocol fee (10%). Base fee is 2% (200 bps).
    pub const MAX_FEE_BPS: u16 = 1_000;
}
