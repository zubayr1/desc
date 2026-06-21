use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod states;

use desc_escrow::states::Outcome;
use instructions::*;

declare_id!("AHGBmnYQCXJwnKKPixjmt6KAbDjVpMQtETRASzycJ47T");

#[program]
pub mod desc_moderation {
    use super::*;

    /// Bootstrap the program config + verdict-authority PDA.
    pub fn initialize(
        ctx: Context<Initialize>,
        escrow_program: Pubkey,
        min_verdicts: u8,
    ) -> Result<()> {
        ctx.accounts
            .initialize(escrow_program, min_verdicts, &ctx.bumps)
    }

    /// Admin registers a moderator (wallet + on-chain recipient + label).
    pub fn register_moderator(
        ctx: Context<RegisterModerator>,
        authority: Pubkey,
        recipient: String,
        label: String,
    ) -> Result<()> {
        ctx.accounts
            .register_moderator(authority, recipient, label, &ctx.bumps)
    }

    /// A moderator pauses/resumes itself.
    pub fn set_moderator_active(ctx: Context<SetModeratorActive>, active: bool) -> Result<()> {
        ctx.accounts.set_moderator_active(active)
    }

    /// A registered, active moderator records a verdict → CPI into the escrow.
    pub fn submit_verdict(
        ctx: Context<SubmitVerdict>,
        outcome: Outcome,
        verdict_hash: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.submit_verdict(outcome, verdict_hash)
    }
}
