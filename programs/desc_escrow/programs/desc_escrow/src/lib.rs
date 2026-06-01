use anchor_lang::prelude::*;

declare_id!("4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU");

#[program]
pub mod desc_escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
