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
/// The moderator fees need no special handling: the whole vault sweeps back to
/// the initiator, and a `Funded` escrow was never accepted, so no moderator can
/// have voted.
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

    /// The escrow's panel — created for every escrow, so a cancelled one has to
    /// close it or the initiator's rent is orphaned on chain. Rent goes back to
    /// the initiator, who put it up at creation.
    ///
    /// Boxed along with the rest: adding an account to an instruction that
    /// already carries the escrow is how this program hit the BPF 4KB stack
    /// limit before (see `create_escrow`).
    #[account(
        mut,
        close = initiator,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,

    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Refund destination — the initiator's USDC account.
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
        // A stale program reading a newer account decodes silently and wrongly.
        self.escrow.check_version()?;
        // Cancellable only before any committer has accepted.
        require!(
            self.escrow.status == EscrowStatus::Funded,
            EscrowError::InvalidStatus
        );
        require!(self.escrow.committer.is_none(), EscrowError::InvalidStatus);

        // Escrow PDA signs for its own vault.
        let initiator_key = self.initiator.key();
        let contract_id = self.escrow.contract_id;
        let bump = self.escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            Escrow::SEED_PREFIX,
            initiator_key.as_ref(),
            contract_id.as_ref(),
            &[bump],
        ]];

        // Return the full deposit to the initiator.
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

        // Close the now-empty vault, returning its rent to the initiator. The
        // panel is closed by its `close = initiator` constraint.
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
