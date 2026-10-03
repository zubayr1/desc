use anchor_lang::prelude::*;

/// Program config (PDA, seeds = [b"config", admin]).
///
/// Seeded with `admin`, so it is per-platform rather than a squattable
/// singleton. It is the root of the verdict-authority chain: the escrow's
/// `settlement_authority` is this program's `[b"authority", config]` signer PDA,
/// so the only way to record a verdict is through here — and the only way to
/// make it act is a registered moderator's signature.
#[account]
#[derive(InitSpace)]
pub struct ModerationConfig {
    pub version: u8,
    /// May `register_moderator`. Also part of the PDA seed.
    pub admin: Pubkey,
    /// The `desc_escrow` program this config authorizes verdicts for.
    pub escrow_program: Pubkey,
    /// Verdicts required to settle. Panel consensus lives on the escrow's
    /// `Panel`; this stays 1.
    pub min_verdicts: u8,
    pub bump: u8,
    /// Bump of the `[b"authority", config]` signer PDA, stored so
    /// `submit_verdict` can sign the CPI.
    pub authority_bump: u8,
    pub reserved: [u8; 64],
}

impl ModerationConfig {
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, admin].
    pub const SEED_PREFIX: &'static [u8] = b"config";

    /// Seed prefix for the verdict-authority signer PDA;
    /// full seeds = [AUTHORITY_SEED_PREFIX, config].
    pub const AUTHORITY_SEED_PREFIX: &'static [u8] = b"authority";
}
