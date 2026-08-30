use anchor_lang::prelude::*;

use crate::error::EscrowError;

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
    /// Key authorized to record a verdict on an escrow.
    ///
    /// `bootstrap` points this at the `desc_moderation` verdict-authority PDA,
    /// so a registered moderator settles by CPI and no platform keypair can.
    /// It is a field rather than a seed so it stays rotatable — that is the
    /// seam V2 uses to widen the pool from one moderator to a staked set.
    pub settlement_authority: Pubkey,
    /// Destination for the protocol fee.
    pub treasury: Pubkey,
    /// Base protocol fee in basis points (200 = 2%).
    pub protocol_fee_bps: u16,
    /// Global kill-switch — blocks new escrows / settlements when true.
    pub paused: bool,
    pub bump: u8,
    /// Minimum protocol fee in token base units. The fee charged is
    /// `max(protocol_fee_bps of amount, protocol_fee_min)` — a floor so tiny
    /// contracts still cover the roughly-fixed cost to serve them. Zero disables
    /// the floor (old configs, whose `reserved` was zeroed, read 0 → no floor).
    pub protocol_fee_min: u64,
    /// Smallest contract `amount` the protocol will escrow, in token base units.
    ///
    /// Pairs with `protocol_fee_min`: below the crossover point the floor is a
    /// rising share of a shrinking contract, so a minimum keeps the effective
    /// fee rate sane (at 200 bps + a $1 floor, $50 is where they meet). Zero
    /// disables the minimum — including for configs created before this field
    /// existed, whose `reserved` was zeroed.
    pub min_amount: u64,
    /// Forward-compat padding. Carve new fields from here.
    pub reserved: [u8; 48],
}

impl Config {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, authority].
    pub const SEED_PREFIX: &'static [u8] = b"config";

    /// Upper bound on the protocol fee (10%). Base fee is 2% (200 bps).
    pub const MAX_FEE_BPS: u16 = 1_000;

    /// Upper bound on the fee floor — 100 tokens (USDC, 6 decimals). The floor
    /// is an absolute amount rather than a rate, so an unbounded value would let
    /// a fat-fingered config make every contract unaffordable (or overflow the
    /// deposit) with no clear error. Well above any plausible cost to serve.
    pub const MAX_FEE_MIN: u64 = 100_000_000;

    /// Checks the fee parameters are coherent *together*. Call this on the
    /// finished config, after every field has been applied — a single
    /// `update_config` may raise the floor and the minimum in one go, and
    /// per-field checks would reject that depending on the order.
    ///
    /// The floor must never exceed the smallest contract the protocol accepts,
    /// or a minimum-sized deal pays 100% or more in fees. `min_amount == 0`
    /// disables the minimum, and with it this check.
    pub fn validate_fee_bounds(&self) -> Result<()> {
        require!(
            self.min_amount == 0 || self.protocol_fee_min <= self.min_amount,
            EscrowError::FeeFloorAboveMinimum
        );
        Ok(())
    }
}
