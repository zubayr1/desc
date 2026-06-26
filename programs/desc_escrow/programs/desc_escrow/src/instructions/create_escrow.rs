use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus};

/// Initiator opens an escrow and deposits the full amount (payout + protocol
/// fee + moderator surcharge) into a program-owned vault. Status -> Funded.
///
/// The protocol fee is snapshotted from the live `Config` so it's trustless and
/// can't drift if the config fee changes mid-deal.
#[derive(Accounts)]
#[instruction(contract_id: [u8; 16])]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX, config.authority.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = initiator,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [Escrow::SEED_PREFIX, initiator.key().as_ref(), contract_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    /// Program-owned vault (PDA token account) that holds the deposit.
    #[account(
        init,
        payer = initiator,
        token::mint = mint,
        token::authority = escrow,
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Initiator's USDC account funding the deposit.
    #[account(
        mut,
        token::mint = mint,
        token::authority = initiator,
    )]
    pub initiator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateEscrow<'info> {
    pub fn create_escrow(
        &mut self,
        contract_id: [u8; 16],
        amount: u64,
        moderator_count: u8,
        moderator_surcharge: u64,
        deadline: i64,
        bumps: &CreateEscrowBumps,
    ) -> Result<()> {
        require!(!self.config.paused, EscrowError::ProtocolPaused);
        require!(amount > 0, EscrowError::InvalidAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, EscrowError::InvalidDeadline);

        // Snapshot the protocol fee from the live config (trustless).
        let protocol_fee = (amount as u128)
            .checked_mul(self.config.protocol_fee_bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(EscrowError::MathOverflow)? as u64;

        // Total the initiator must deposit: payout + protocol fee + surcharge.
        let total = amount
            .checked_add(protocol_fee)
            .and_then(|v| v.checked_add(moderator_surcharge))
            .ok_or(EscrowError::MathOverflow)?;

        transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.initiator_token_account.to_account_info(),
                    to: self.vault.to_account_info(),
                    authority: self.initiator.to_account_info(),
                },
            ),
            total,
        )?;

        self.escrow.set_inner(Escrow {
            version: Escrow::VERSION,
            config: self.config.key(),
            initiator: self.initiator.key(),
            committer: None,
            mint: self.mint.key(),
            vault: self.vault.key(),
            amount,
            protocol_fee,
            moderator_surcharge,
            moderator_count,
            status: EscrowStatus::Funded,
            outcome: None,
            verdict_hash: [0; 32],
            deliverable_hash: [0; 32],
            deadline,
            created_at: now,
            submitted_at: None,
            contract_id,
            bump: bumps.escrow,
            vault_bump: bumps.vault,
            moderator: Pubkey::default(),
            reserved: [0; 96],
        });

        Ok(())
    }
}
