use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus, Outcome, Panel};

/// Permissionless. Sets `Inconclusive` once no vote or tiebreak can still decide it.
#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    #[account(
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,
}

impl<'info> Finalize<'info> {
    pub fn finalize(&mut self) -> Result<()> {
        self.escrow.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Submitted
                && self.escrow.outcome.is_none()
                && self.panel.count > 0,
            EscrowError::InvalidStatus
        );
        let now = Clock::get()?.unix_timestamp;
        let exhausted = self.panel.tiebreak_fills >= self.panel.tiebreak_cap()
            || self.panel.first_silent().is_none()
            || now > self.escrow.tiebreak_deadline(&self.panel);
        require!(
            self.escrow.voting_closed(now) && exhausted,
            EscrowError::NotFinalizable
        );

        self.escrow.outcome = Some(Outcome::Inconclusive);
        Ok(())
    }
}
