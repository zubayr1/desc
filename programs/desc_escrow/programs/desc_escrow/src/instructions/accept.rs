use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus};

/// A committer accepts a funded escrow, binding themselves to the deal.
///
/// The committer is simply whoever signs this instruction first: there is no
/// on-chain "link". The shareable link is purely off-chain discovery — it tells
/// a person which escrow to open. They connect any wallet and sign `accept`,
/// and that signer becomes the committer. First valid accept wins.
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
        // A stale program reading a newer account decodes silently and wrongly.
        self.escrow.check_version()?;
        // Only a funded, unaccepted escrow can be accepted (first-accept-wins).
        require!(
            self.escrow.status == EscrowStatus::Funded,
            EscrowError::InvalidStatus
        );
        require!(self.escrow.committer.is_none(), EscrowError::InvalidStatus);

        // No self-dealing.
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
