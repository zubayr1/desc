use anchor_lang::prelude::*;

use crate::error::EscrowError;

/// Global protocol config (PDA, seeds = [b"config", authority]).
///
/// Seeded with `authority`, so it is deterministic per-admin rather than a
/// squattable singleton — and so the admin cannot be rotated in place.
/// `settlement_authority` is a field, not a seed, so that one rotates freely.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub version: u8,
    /// Admin. Also part of the PDA seed.
    pub authority: Pubkey,
    /// Who may record a verdict. `bootstrap` points this at the
    /// `desc_moderation` verdict-authority PDA, so moderators settle by CPI and
    /// no platform keypair can.
    pub settlement_authority: Pubkey,
    /// Destination for the protocol fee.
    pub treasury: Pubkey,
    /// Base protocol fee in basis points (200 = 2%).
    pub protocol_fee_bps: u16,
    /// Global kill-switch — blocks new escrows / settlements when true.
    pub paused: bool,
    pub bump: u8,
    /// Fee floor: the fee charged is `max(bps of amount, this)`, so tiny
    /// contracts still cover a roughly-fixed cost. Zero disables it.
    pub protocol_fee_min: u64,
    /// Smallest contract the protocol will escrow. Pairs with
    /// `protocol_fee_min`: below the crossover the floor is a rising share of a
    /// shrinking contract. Zero disables it.
    pub min_amount: u64,
    /// Seconds per moderation phase. Zero = `Escrow::DEFAULT_VERDICT_WINDOW`.
    pub verdict_window: i64,
    pub reserved: [u8; 40],
}

impl Config {
    pub const VERSION: u8 = 2;

    /// See `Escrow::check_version` for why this is `<=` and not `==`.
    pub fn check_version(&self) -> Result<()> {
        require!(
            self.version <= Self::VERSION,
            EscrowError::UnsupportedVersion
        );
        Ok(())
    }

    /// Seed prefix; full seeds = [SEED_PREFIX, authority].
    pub const SEED_PREFIX: &'static [u8] = b"config";

    /// Upper bound on the protocol fee (10%). Base fee is 2% (200 bps).
    pub const MAX_FEE_BPS: u16 = 1_000;

    /// Upper bound on the fee floor (100 USDC). The floor is an absolute
    /// amount, not a rate, so unbounded it could make every contract
    /// unaffordable with no clear error.
    pub const MAX_FEE_MIN: u64 = 100_000_000;

    pub const MAX_VERDICT_WINDOW: i64 = 7 * 86_400;

    /// Fee coherence, checked on the FINISHED config rather than per field: one
    /// `update_config` may raise the floor and the minimum together, and
    /// per-field checks would reject that depending on order.
    ///
    /// The floor must never exceed the smallest accepted contract, or a
    /// minimum-sized deal pays 100% in fees.
    pub fn validate_fee_bounds(&self) -> Result<()> {
        require!(
            self.min_amount == 0 || self.protocol_fee_min <= self.min_amount,
            EscrowError::FeeFloorAboveMinimum
        );
        Ok(())
    }
}
