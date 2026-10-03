use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::instructions::settle::settle_panel;
use crate::states::{Config, Escrow, EscrowStatus, Outcome, Panel};

/// Pay out a passed escrow. Signed by EITHER party, so payout never depends on
/// one party — or the settlement authority — being online.
///
/// Requires `Submitted` + Pass. Pays the committer, the treasury, and every
/// moderator that voted; returns any unspent moderator fee to the initiator;
/// closes the vault and the panel (rents -> initiator).
///
/// `remaining_accounts` is two per SEAT, in panel order (see `settle_panel`).
#[derive(Accounts)]
pub struct Release<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = config,
        has_one = vault,
        has_one = initiator,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    #[account(has_one = treasury)]
    pub config: Box<Account<'info, Config>>,

    /// Closed here, rent back to the INITIATOR who put it up — `release` may be
    /// signed by either party, so the signer must never be the destination.
    #[account(
        mut,
        close = initiator,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,

    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Committer's USDC account — receives the payout.
    #[account(
        mut,
        constraint = committer_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub committer_token_account: Box<Account<'info, TokenAccount>>,

    /// Protocol treasury token account — receives the protocol fee.
    #[account(
        mut,
        constraint = treasury.mint == escrow.mint @ EscrowError::Unauthorized,
    )]
    pub treasury: Box<Account<'info, TokenAccount>>,

    /// Receives the fees of any moderator that did not vote. Required even when
    /// all voted, so the vault can always be drained to zero and closed.
    #[account(
        mut,
        constraint = initiator_token_account.mint == escrow.mint @ EscrowError::Unauthorized,
        constraint = initiator_token_account.owner == escrow.initiator @ EscrowError::Unauthorized,
    )]
    pub initiator_token_account: Box<Account<'info, TokenAccount>>,

    /// Initiator — receives the vault's and the panel's rent on close.
    #[account(mut)]
    pub initiator: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Release<'info> {
    pub fn release(&mut self, panel_accounts: &'info [AccountInfo<'info>]) -> Result<()> {
        self.escrow.check_version()?;
        self.config.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        require!(
            self.escrow.outcome == Some(Outcome::Pass),
            EscrowError::InvalidStatus
        );

        // Either party may execute the payout.
        let signer = self.signer.key();
        require!(
            signer == self.escrow.initiator || Some(signer) == self.escrow.committer,
            EscrowError::Unauthorized
        );
        // The payout must land in the bound committer's account.
        require!(
            self.escrow.committer == Some(self.committer_token_account.owner),
            EscrowError::Unauthorized
        );

        let initiator_key = self.escrow.initiator;
        let contract_id = self.escrow.contract_id;
        let bump = self.escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            Escrow::SEED_PREFIX,
            initiator_key.as_ref(),
            contract_id.as_ref(),
            &[bump],
        ]];

        // Payout to the committer.
        transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.vault.to_account_info(),
                    to: self.committer_token_account.to_account_info(),
                    authority: self.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            self.escrow.amount,
        )?;

        // Protocol fee to the treasury.
        if self.escrow.protocol_fee > 0 {
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
                self.escrow.protocol_fee,
            )?;
        }

        // Every moderator that voted, its own fee. Empty on a no-mod escrow.
        let paid = settle_panel(
            &self.panel,
            &self.escrow,
            panel_accounts,
            self.vault.to_account_info(),
            self.escrow.to_account_info(),
            self.token_program.to_account_info(),
            signer_seeds,
        )?;

        // Whatever the initiator locked for moderators who never voted comes
        // back to them. Also drains the vault so it can be closed.
        let unspent = self
            .escrow
            .moderator_surcharge
            .checked_sub(paid)
            .ok_or(EscrowError::MathOverflow)?;
        if unspent > 0 {
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
                unspent,
            )?;
        }

        // Close the drained vault, rent back to the initiator. The panel account
        // is closed by its `close = initiator` constraint.
        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.vault.to_account_info(),
                destination: self.initiator.to_account_info(),
                authority: self.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        self.escrow.status = EscrowStatus::Settled;

        Ok(())
    }
}
