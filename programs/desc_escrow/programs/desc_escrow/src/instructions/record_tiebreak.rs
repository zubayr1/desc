use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{
    vote_byte, Config, Escrow, EscrowStatus, ModeratorReputation, Outcome, Panel,
};

/// A tiebreaker fills the first silent seat after voting closes with no majority,
/// inherits its fee, and the replaced moderator is marked `missed`.
#[derive(Accounts)]
pub struct RecordTiebreak<'info> {
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

    /// Verified below against the seat the program picks.
    #[account(mut)]
    pub replaced_reputation: Box<Account<'info, ModeratorReputation>>,
}

impl<'info> RecordTiebreak<'info> {
    pub fn record_tiebreak(
        &mut self,
        outcome: Outcome,
        verdict_hash: [u8; 32],
        tiebreaker: Pubkey,
    ) -> Result<()> {
        self.escrow.check_version()?;
        self.config.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Submitted && self.escrow.outcome.is_none(),
            EscrowError::InvalidStatus
        );
        let now = Clock::get()?.unix_timestamp;
        require!(self.escrow.voting_closed(now), EscrowError::TiebreakNotOpen);
        require!(
            now <= self.escrow.tiebreak_deadline(&self.panel),
            EscrowError::VotingClosed
        );
        require!(
            self.panel.tiebreak_fills < self.panel.tiebreak_cap(),
            EscrowError::TiebreakCapReached
        );
        require!(
            self.panel.seat_of(&tiebreaker).is_none(),
            EscrowError::DuplicateModerator
        );

        let vote = vote_byte(outcome).ok_or(EscrowError::InvalidVote)?;
        let seat = self.panel.first_silent().ok_or(EscrowError::NoSilentSeat)?;
        let replaced = self.panel.entries[seat].moderator;

        let rep = &mut self.replaced_reputation;
        rep.check_version()?;
        let expected = Pubkey::create_program_address(
            &[ModeratorReputation::SEED_PREFIX, replaced.as_ref(), &[rep.bump]],
            &crate::ID,
        )
        .map_err(|_| error!(EscrowError::Unauthorized))?;
        require_keys_eq!(expected, rep.key(), EscrowError::Unauthorized);
        rep.record_missed();

        let entry = &mut self.panel.entries[seat];
        entry.moderator = tiebreaker;
        entry.vote = vote;
        entry.verdict_hash = verdict_hash;
        self.panel.tiebreak_fills += 1;

        if let Some(decided) = self.panel.majority() {
            self.escrow.outcome = Some(decided);
            self.escrow.verdict_hash = verdict_hash;
        }
        Ok(())
    }
}
