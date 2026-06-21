use anchor_lang::prelude::*;

/// Program config (PDA, seeds = [b"config", admin]).
///
/// Seeded with `admin` so the config is deterministic per-platform and not a
/// squattable global singleton (mirrors `desc_escrow`'s `Config`). It is the
/// root of the verdict-authority chain: the escrow's `settlement_authority` is
/// set to this program's `[b"authority", config]` signer PDA, so the *only* way
/// to record a verdict is through this program — and the only way to make it act
/// is a registered moderator's signature.
///
/// Backward-compat discipline (same as desc_escrow):
/// - `version` is the first field for version dispatch / migrations.
/// - `reserved` is the LAST field. New fields are carved from it so the account
///   size stays constant (no `realloc`); freed bytes are zeroed.
#[account]
#[derive(InitSpace)]
pub struct ModerationConfig {
    /// Schema version of this account. Set to `VERSION` at init.
    pub version: u8,
    /// Platform admin — may `register_moderator`. Also part of the PDA seed.
    pub admin: Pubkey,
    /// The `desc_escrow` program this config authorizes verdicts for (CPI target).
    pub escrow_program: Pubkey,
    /// Verdicts required to settle a contract. V1 = 1; k-of-n consensus is V2.
    pub min_verdicts: u8,
    pub bump: u8,
    /// Bump of the `[b"authority", config]` signer PDA — the escrow's
    /// `settlement_authority`. Stored so `submit_verdict` can sign the CPI.
    pub authority_bump: u8,
    /// Forward-compat padding (V2: fee/reward params, …). Keep it LAST.
    pub reserved: [u8; 64],
}

impl ModerationConfig {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, admin].
    pub const SEED_PREFIX: &'static [u8] = b"config";

    /// Seed prefix for the verdict-authority signer PDA;
    /// full seeds = [AUTHORITY_SEED_PREFIX, config].
    pub const AUTHORITY_SEED_PREFIX: &'static [u8] = b"authority";
}
