use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::instructions::settle::settle_panel;
use crate::states::{Config, Escrow, EscrowStatus, Outcome, Panel};

/// Initiator reclaims the deposit. Fires on either trigger:
///   1. `Active` & past deadline with no submission  -> committer ghosted, or
///   2. `Submitted` & `outcome == Fail`              -> work rejected.
///
/// Payout policy — the protocol is paid for rendering a verdict, not for the
/// verdict going one way:
/// - Ghost-timeout: the ENTIRE vault returns; nobody did any work.
/// - Fail: every moderator that voted earns its fee (including one outvoted,
///   which did the same work), the treasury keeps `verification_fee` as cost
///   recovery, and everything else returns to the initiator.
///
/// So the protocol never profits from a failed deal, and is never paid to pass
/// one either.
///
/// `remaining_accounts` is two per SEAT, in panel order (see `settle_panel`).
/// Vault and panel are closed (rents -> initiator); the escrow is kept as a
/// `Refunded` record.
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, initiator.key().as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = config,
        has_one = initiator,
        has_one = vault,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// Bound via `escrow.config` — supplies the treasury the verification fee
    /// goes to (read live, like `release` does).
    #[account(has_one = treasury)]
    pub config: Box<Account<'info, Config>>,

    /// Closed here, rent back to the initiator who put it up at creation.
    #[account(
        mut,
        close = initiator,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,

    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = initiator_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
        constraint = initiator_token_account.owner == initiator.key() @ EscrowError::Unauthorized,
    )]
    pub initiator_token_account: Box<Account<'info, TokenAccount>>,

    /// Receives the verification fee on a Fail. Bound by the config, so always
    /// required — even on a ghost-timeout, where nothing is sent.
    #[account(
        mut,
        constraint = treasury.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub treasury: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Refund<'info> {
    pub fn refund(&mut self, panel_accounts: &'info [AccountInfo<'info>]) -> Result<()> {
        self.escrow.check_version()?;
        self.config.check_version()?;
        let now = Clock::get()?.unix_timestamp;

        let ghosted = self.escrow.status == EscrowStatus::Active && now > self.escrow.deadline;
        let failed = self.escrow.status == EscrowStatus::Submitted
            && self.escrow.outcome == Some(Outcome::Fail);
        require!(ghosted || failed, EscrowError::InvalidStatus);

        let initiator_key = self.initiator.key();
        let contract_id = self.escrow.contract_id;
        let bump = self.escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            Escrow::SEED_PREFIX,
            initiator_key.as_ref(),
            contract_id.as_ref(),
            &[bump],
        ]];

        let total = self.vault.amount;

        // Zero on a ghost-timeout: the escrow never reached `Submitted`, so no
        // seat holds a vote and nobody is paid or scored.
        let paid = settle_panel(
            &self.panel,
            &self.escrow,
            panel_accounts,
            self.vault.to_account_info(),
            self.escrow.to_account_info(),
            self.token_program.to_account_info(),
            signer_seeds,
        )?;

        let to_initiator = if failed {

            // Clamped to the fee actually escrowed, so a legacy or malformed
            // account can never take more than was deposited.
            let verification_fee = self.escrow.verification_fee.min(self.escrow.protocol_fee);
            if verification_fee > 0 {
                transfer(
                    CpiContext::new_with_signer(
                        self.token_program.to_account_info(),
                        Transfer {
                            from: self.vault.to_account_info(),
                            to: self.treasury.to_account_info(),
                            authority: self.escrow.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    verification_fee,
                )?;
            }

            total
                .checked_sub(paid)
                .and_then(|v| v.checked_sub(verification_fee))
                .ok_or(EscrowError::MathOverflow)?
        } else {
            total.checked_sub(paid).ok_or(EscrowError::MathOverflow)?
        };

        // Return the remaining deposit to the initiator.
        transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.vault.to_account_info(),
                    to: self.initiator_token_account.to_account_info(),
                    authority: self.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            to_initiator,
        )?;

        // Close the now-empty vault, rent back to the initiator. The panel
        // account is closed by its `close = initiator` constraint.
        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.vault.to_account_info(),
                destination: self.initiator.to_account_info(),
                authority: self.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        self.escrow.status = EscrowStatus::Refunded;

        Ok(())
    }
}
