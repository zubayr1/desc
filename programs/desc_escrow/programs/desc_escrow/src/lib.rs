use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod states;

use instructions::*;

declare_id!("4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU");

#[program]
pub mod desc_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        settlement_authority: Pubkey,
        treasury: Pubkey,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        ctx.accounts
            .initialize_config(settlement_authority, treasury, protocol_fee_bps, &ctx.bumps)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        settlement_authority: Option<Pubkey>,
        treasury: Option<Pubkey>,
        protocol_fee_bps: Option<u16>,
        paused: Option<bool>,
    ) -> Result<()> {
        ctx.accounts
            .update_config(settlement_authority, treasury, protocol_fee_bps, paused)
    }
}
