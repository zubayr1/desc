use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::Config;

/// Create the global protocol config (PDA, seeds = [b"config", authority]).
/// The signer becomes the `authority` and pays for the account.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [Config::SEED_PREFIX, authority.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeConfig<'info> {
    pub fn initialize_config(
        &mut self,
        settlement_authority: Pubkey,
        treasury: Pubkey,
        protocol_fee_bps: u16,
        protocol_fee_min: u64,
        min_amount: u64,
        bumps: &InitializeConfigBumps,
    ) -> Result<()> {
        require!(
            protocol_fee_min <= Config::MAX_FEE_MIN,
            EscrowError::InvalidFeeMin
        );
        require!(
            protocol_fee_bps <= Config::MAX_FEE_BPS,
            EscrowError::InvalidFeeBps
        );

        self.config.set_inner(Config {
            version: Config::VERSION,
            authority: self.authority.key(),
            settlement_authority,
            treasury,
            protocol_fee_bps,
            paused: false,
            bump: bumps.config,
            protocol_fee_min,
            min_amount,
            reserved: [0; 48],
        });

        // Cross-field check on the finished config (see `validate_fee_bounds`).
        self.config.validate_fee_bounds()?;

        Ok(())
    }
}
