use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus};

/// A committer accepts a funded escrow, binding themselves to the deal.
///
/// Whoever signs first becomes the committer — there is no on-chain "link". The
/// shareable link is off-chain discovery only: it tells a person which escrow to
/// open.
#[derive(Accounts)]
pub struct Accept<'info> {
    pub committer: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

impl<'info> Accept<'info> {
    pub fn accept(&mut self) -> Result<()> {
        self.escrow.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Funded,
            EscrowError::InvalidStatus
        );
        require!(self.escrow.committer.is_none(), EscrowError::InvalidStatus);

        require_keys_neq!(
            self.committer.key(),
            self.escrow.initiator,
            EscrowError::SelfDeal
        );

        self.escrow.committer = Some(self.committer.key());
        self.escrow.status = EscrowStatus::Active;

        Ok(())
    }
}
