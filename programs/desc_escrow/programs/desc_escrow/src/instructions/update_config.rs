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
        paused: Option<bool>,
    ) -> Result<()> {
        if let Some(bps) = protocol_fee_bps {
            require!(bps <= Config::MAX_FEE_BPS, EscrowError::InvalidFeeBps);
            self.config.protocol_fee_bps = bps;
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

        Ok(())
    }
}
