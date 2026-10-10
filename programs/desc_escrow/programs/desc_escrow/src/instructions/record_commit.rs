use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, Panel, VOTE_COMMITTED, VOTE_NONE};

/// A panel moderator posts its hidden vote. Reached only by CPI from `desc_moderation`.
#[derive(Accounts)]
pub struct RecordCommit<'info> {
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

    #[account(
        mut,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump = panel.bump,
    )]
    pub panel: Box<Account<'info, Panel>>,
}

impl<'info> RecordCommit<'info> {
    pub fn record_commit(&mut self, commit: [u8; 32], moderator: Pubkey) -> Result<()> {
        self.escrow.check_version()?;
        self.config.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        require!(self.panel.uses_commit_reveal(), EscrowError::WrongVotingMode);
        let now = Clock::get()?.unix_timestamp;
        require!(now <= self.escrow.commit_deadline, EscrowError::VotingClosed);

        let seat = self
            .panel
            .seat_of(&moderator)
            .ok_or(EscrowError::NotAssignedModerator)?;
        require!(
            self.panel.entries[seat].vote == VOTE_NONE,
            EscrowError::AlreadyVoted
        );
        self.panel.entries[seat].vote = VOTE_COMMITTED;
        self.panel.entries[seat].verdict_hash = commit;

        if self.panel.all_committed() {
            self.escrow.reveal_deadline = now
                .checked_add(self.escrow.window())
                .ok_or(EscrowError::MathOverflow)?;
        }
        Ok(())
    }
}
