use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::Config;

/// Admin-only update of the protocol config. `authority` is part of the PDA
/// seed, so it is intentionally not changeable here.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Config::SEED_PREFIX, authority.key().as_ref()],
        bump = config.bump,
        has_one = authority,
    )]
    pub config: Account<'info, Config>,
}

impl<'info> UpdateConfig<'info> {
    pub fn update_config(
        &mut self,
        settlement_authority: Option<Pubkey>,
        treasury: Option<Pubkey>,
        protocol_fee_bps: Option<u16>,
        protocol_fee_min: Option<u64>,
        min_amount: Option<u64>,
        paused: Option<bool>,
    ) -> Result<()> {
        self.config.check_version()?;
        if let Some(bps) = protocol_fee_bps {
            require!(bps <= Config::MAX_FEE_BPS, EscrowError::InvalidFeeBps);
            self.config.protocol_fee_bps = bps;
        }
        if let Some(min) = protocol_fee_min {
            require!(min <= Config::MAX_FEE_MIN, EscrowError::InvalidFeeMin);
            self.config.protocol_fee_min = min;
        }
        if let Some(min) = min_amount {
            self.config.min_amount = min;
        }
        if let Some(settlement_authority) = settlement_authority {
            self.config.settlement_authority = settlement_authority;
        }
        if let Some(treasury) = treasury {
            self.config.treasury = treasury;
        }
        if let Some(paused) = paused {
            self.config.paused = paused;
        }

        // Checked on the RESULT, after every option is applied, so one call may
        // raise the floor and the minimum together in either order.
        self.config.validate_fee_bounds()?;

        Ok(())
    }
}
