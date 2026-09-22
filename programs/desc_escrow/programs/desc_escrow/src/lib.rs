use anchor_lang::prelude::*;

pub mod error;
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

    pub fn create_escrow<'info>(
        // `'info` is spelled out because the chosen moderators arrive as
        // `remaining_accounts`, which must share the accounts' lifetime.
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
            // The chosen moderators: none for no-mod, otherwise 1 or 3.
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
        // `'info` is spelled out because the voting moderators' token accounts
        // arrive as `remaining_accounts`, which must share the accounts' lifetime.
        ctx: Context<'_, '_, '_, 'info, Release<'info>>,
    ) -> Result<()> {
        // One token account per moderator that voted, in panel order.
        ctx.accounts.release(ctx.remaining_accounts)
    }

    pub fn refund<'info>(ctx: Context<'_, '_, '_, 'info, Refund<'info>>) -> Result<()> {
        // One token account per moderator that voted, in panel order. Empty on a
        // ghost-timeout, where nobody judged.
        ctx.accounts.refund(ctx.remaining_accounts)
    }

    pub fn mutual_cancel(ctx: Context<MutualCancel>) -> Result<()> {
        ctx.accounts.mutual_cancel()
    }
}
