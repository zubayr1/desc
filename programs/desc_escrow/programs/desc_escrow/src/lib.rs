use anchor_lang::prelude::*;

pub mod error;
pub mod foreign;
pub mod instructions;
pub mod states;

use instructions::*;
use states::Outcome;

declare_id!("4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU");

#[program]
pub mod desc_escrow {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        settlement_authority: Pubkey,
        treasury: Pubkey,
        protocol_fee_bps: u16,
        protocol_fee_min: u64,
        min_amount: u64,
    ) -> Result<()> {
        ctx.accounts.initialize_config(
            settlement_authority,
            treasury,
            protocol_fee_bps,
            protocol_fee_min,
            min_amount,
            &ctx.bumps,
        )
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        settlement_authority: Option<Pubkey>,
        treasury: Option<Pubkey>,
        protocol_fee_bps: Option<u16>,
        protocol_fee_min: Option<u64>,
        min_amount: Option<u64>,
        paused: Option<bool>,
    ) -> Result<()> {
        ctx.accounts.update_config(
            settlement_authority,
            treasury,
            protocol_fee_bps,
            protocol_fee_min,
            min_amount,
            paused,
        )
    }

    /// Create a moderator's reputation account. Permissionless, caller pays —
    /// see `InitModeratorReputation` for why that is safe.
    pub fn init_moderator_reputation(
        ctx: Context<InitModeratorReputation>,
        moderator: Pubkey,
    ) -> Result<()> {
        ctx.accounts
            .init_moderator_reputation(moderator, &ctx.bumps)
    }

    pub fn create_escrow<'info>(
        // `'info` is spelled out because `remaining_accounts` must share the
        // accounts' lifetime. Same below, on release and refund.
        ctx: Context<'_, '_, '_, 'info, CreateEscrow<'info>>,
        contract_id: [u8; 16],
        amount: u64,
        deadline: i64,
        no_mod: bool,
        max_moderator_fee: u64,
    ) -> Result<()> {
        ctx.accounts.create_escrow(
            contract_id,
            amount,
            deadline,
            no_mod,
            max_moderator_fee,
            ctx.remaining_accounts,
            &ctx.bumps,
        )
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        ctx.accounts.cancel()
    }

    pub fn accept(ctx: Context<Accept>) -> Result<()> {
        ctx.accounts.accept()
    }

    pub fn submit(ctx: Context<Submit>, deliverable_hash: [u8; 32]) -> Result<()> {
        ctx.accounts.submit(deliverable_hash)
    }

    pub fn record_verdict(
        ctx: Context<RecordVerdict>,
        outcome: Outcome,
        verdict_hash: [u8; 32],
        moderator: Pubkey,
    ) -> Result<()> {
        ctx.accounts
            .record_verdict(outcome, verdict_hash, moderator)
    }

    pub fn release<'info>(
        // The THIRD lifetime is `'info` too: `settle_panel` deserializes the
        // reputation accounts as `Account<'info, _>`, so the slice has to
        // outlive the call.
        ctx: Context<'_, '_, 'info, 'info, Release<'info>>,
    ) -> Result<()> {
        ctx.accounts.release(ctx.remaining_accounts)
    }

    pub fn refund<'info>(ctx: Context<'_, '_, 'info, 'info, Refund<'info>>) -> Result<()> {
        ctx.accounts.refund(ctx.remaining_accounts)
    }

    pub fn mutual_cancel(ctx: Context<MutualCancel>) -> Result<()> {
        ctx.accounts.mutual_cancel()
    }
}
