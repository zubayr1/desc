use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{vote_byte, Config, Escrow, EscrowStatus, Outcome, Panel, VOTE_NONE};

/// Panel of 1 only — it has nobody to copy, so it votes directly, inside its window.
#[derive(Accounts)]
pub struct RecordVerdict<'info> {
    pub settlement_authority: Signer<'info>,

    #[account(has_one = settlement_authority)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [Escrow::SEED_PREFIX, escrow.initiator.as_ref(), escrow.contract_id.as_ref()],
        bump = escrow.bump,
        has_one = config,
        has_one = panel,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// Boxed: large enough to overflow the 4KB stack frame beside the escrow.
    #[account(
        mut,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,
}

impl<'info> RecordVerdict<'info> {
    pub fn record_verdict(
        &mut self,
        outcome: Outcome,
        verdict_hash: [u8; 32],
        moderator: Pubkey,
    ) -> Result<()> {
        self.escrow.check_version()?;
        self.config.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        require!(!self.panel.uses_commit_reveal(), EscrowError::WrongVotingMode);
        let now = Clock::get()?.unix_timestamp;
        require!(!self.escrow.voting_closed(now), EscrowError::VotingClosed);

        let vote = vote_byte(outcome).ok_or(EscrowError::InvalidVote)?;
        let seat = self
            .panel
            .seat_of(&moderator)
            .ok_or(EscrowError::NotAssignedModerator)?;
        require!(
            self.panel.entries[seat].vote == VOTE_NONE,
            EscrowError::AlreadyVoted
        );
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
