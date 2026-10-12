use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{
    commit_hash, vote_byte, Escrow, EscrowStatus, Outcome, Panel, VOTE_COMMITTED, VOTE_MISMATCH,
};

/// Only the seat's own moderator can reveal: the salt comes from its key, so no
/// one else could anyway. A reveal that doesn't match its commit is recorded
/// and burns the seat. A reveal after the majority formed is still paid.
#[derive(Accounts)]
pub struct RevealVerdict<'info> {
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    #[account(
        mut,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,
}

impl<'info> RevealVerdict<'info> {
    pub fn reveal_verdict(
        &mut self,
        moderator: Pubkey,
        outcome: Outcome,
        verdict_hash: [u8; 32],
        salt: [u8; 32],
    ) -> Result<()> {
        self.escrow.check_version()?;
        require_keys_eq!(self.payer.key(), moderator, EscrowError::Unauthorized);
        require!(
            self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            self.escrow.reveal_open(&self.panel, now),
            EscrowError::RevealNotOpen
        );
        require!(!self.escrow.voting_closed(now), EscrowError::VotingClosed);

        let vote = vote_byte(outcome).ok_or(EscrowError::InvalidVote)?;
        let seat = self
            .panel
            .seat_of(&moderator)
            .ok_or(EscrowError::NotAssignedModerator)?;
        let entry = self.panel.entries[seat];
        require!(entry.vote == VOTE_COMMITTED, EscrowError::NotCommitted);

        let expected = commit_hash(vote, &verdict_hash, &salt, &moderator, &self.escrow.key());
        if expected != entry.verdict_hash {
            self.panel.entries[seat].vote = VOTE_MISMATCH;
            return Ok(());
        }

        self.panel.entries[seat].vote = vote;
        self.panel.entries[seat].verdict_hash = verdict_hash;

        if self.escrow.outcome.is_none() {
            if let Some(decided) = self.panel.majority() {
                self.escrow.outcome = Some(decided);
                self.escrow.verdict_hash = verdict_hash;
            }
        }
        Ok(())
    }
}
