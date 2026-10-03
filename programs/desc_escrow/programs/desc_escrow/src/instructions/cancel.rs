use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, transfer, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus, Panel};

/// Initiator cancels an escrow that no committer has accepted yet, reclaiming
/// the full deposit. Allowed ONLY while `Funded` (and thus `committer == None`)
/// — once a committer is `Active`, the initiator can never unilaterally pull the
/// funds. The vault and the panel are closed; the escrow is kept as a
/// `Cancelled` record.
///
/// Moderator fees need no handling: the whole vault sweeps back, and a `Funded`
/// escrow was never accepted, so nobody can have voted.
#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, initiator.key().as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = initiator,
        has_one = vault,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// Created for every escrow, so a cancelled one must close it or the
    /// initiator's rent is orphaned on chain.
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
        constraint = initiator_token_account.mint == escrow.mint,
        constraint = initiator_token_account.owner == initiator.key(),
    )]
    pub initiator_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Cancel<'info> {
    pub fn cancel(&mut self) -> Result<()> {
        self.escrow.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Funded,
            EscrowError::InvalidStatus
        );
        require!(self.escrow.committer.is_none(), EscrowError::InvalidStatus);

        let initiator_key = self.initiator.key();
        let contract_id = self.escrow.contract_id;
        let bump = self.escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            Escrow::SEED_PREFIX,
            initiator_key.as_ref(),
            contract_id.as_ref(),
            &[bump],
        ]];

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
            self.vault.amount,
        )?;

        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.vault.to_account_info(),
                destination: self.initiator.to_account_info(),
                authority: self.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        self.escrow.status = EscrowStatus::Cancelled;

        Ok(())
    }
}
