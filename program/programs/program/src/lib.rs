use anchor_lang::prelude::*;

declare_id!("6MTUNmtgYJs4LASCDHTnQDQmZMh6EptVBr7wNgyr3ZaA");

#[program]
pub mod program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
