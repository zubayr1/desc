use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Escrow, EscrowStatus, Outcome};

/// The bound committer submits their deliverable before the deadline.
/// `Active -> Submitted`.
///
/// This is the transition that FREEZES the funds: once `Submitted`, the deadline
/// no longer matters and only a recorded verdict can move the money. Submitting
/// after the deadline is rejected — that window is the initiator's ghost-refund
/// path, not a submission.
///
/// On a **no-mod** escrow the verdict is settled here: there is no moderator to
/// render one, and the initiator accepted that at creation. The outcome is Pass,
/// so the committer can `release` immediately. Doing it on-chain rather than in a
/// backend job means the payout never waits on a server being up, and `moderator`
/// stays zeroed — nobody judged it, and the record says so.
#[derive(Accounts)]
pub struct Submit<'info> {
    pub committer: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

impl<'info> Submit<'info> {
    pub fn submit(&mut self, deliverable_hash: [u8; 32]) -> Result<()> {
        require!(
            self.escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );
        require!(
            self.escrow.committer == Some(self.committer.key()),
            EscrowError::Unauthorized
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now <= self.escrow.deadline, EscrowError::DeadlinePassed);

        self.escrow.deliverable_hash = deliverable_hash;
        self.escrow.submitted_at = Some(now);
        self.escrow.status = EscrowStatus::Submitted;

        if self.escrow.no_mod {
            self.escrow.outcome = Some(Outcome::Pass);
        }

        Ok(())
    }
}
