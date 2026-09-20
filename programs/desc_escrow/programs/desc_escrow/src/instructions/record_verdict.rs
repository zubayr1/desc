use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, Outcome, Panel, VOTE_FAIL, VOTE_NONE, VOTE_PASS};

/// The settlement authority records ONE moderator's vote on a submitted escrow,
/// and sets the outcome once a majority of its panel agrees. Attestation only —
/// no money moves; the parties then execute `release` (Pass) or `refund` (Fail)
/// themselves.
///
/// A panel of one is decided by its single vote. A panel of three needs two
/// votes that agree, and the escrow is decided the moment they exist — the third
/// moderator is not waited for, and a vote arriving after that is rejected
/// (`VerdictAlreadyFinal`), so it is neither counted nor paid.
///
/// The authority is read LIVE from the bound `Config` (via `escrow.config`), so
/// it stays rotatable. Today it is the `desc_moderation` verdict PDA, which
/// invokes this by CPI — there is no platform keypair that can reach it. V2
/// widens who may drive that PDA (k-of-n consensus); this instruction is
/// unchanged by that.
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

    /// The escrow's panel — who may vote, and the votes so far. Boxed: it is
    /// large enough to overflow the 4KB stack frame alongside the escrow.
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
        // A stale program reading a newer account decodes silently and wrongly.
        self.escrow.check_version()?;
        self.config.check_version()?;
        require!(
            self.escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );
        // Once a majority has decided, the deal is settled: later votes are not
        // counted and their moderators are not paid.
        require!(
            self.escrow.outcome.is_none(),
            EscrowError::VerdictAlreadyFinal
        );

        // Only a moderator seated on this escrow's panel may vote — it is one of
        // the moderators whose price the initiator paid.
        let count = self.panel.count as usize;
        let seat = self.panel.entries[..count]
            .iter()
            .position(|e| e.moderator == moderator)
            .ok_or(EscrowError::NotAssignedModerator)?;

        // One vote each. Two votes from one judge would be a "majority" of one.
        require!(
            self.panel.entries[seat].vote == VOTE_NONE,
            EscrowError::AlreadyVoted
        );
        self.panel.entries[seat].vote = match outcome {
            Outcome::Pass => VOTE_PASS,
            Outcome::Fail => VOTE_FAIL,
        };
        self.panel.entries[seat].verdict_hash = verdict_hash;

        // Tally. `quorum` was snapshotted at creation, so a later rule change
        // cannot move the goalposts on a live deal.
        let votes = |v: u8| {
            self.panel.entries[..count]
                .iter()
                .filter(|e| e.vote == v)
                .count() as u8
        };
        let quorum = self.panel.quorum;
        if votes(VOTE_PASS) >= quorum {
            self.escrow.outcome = Some(Outcome::Pass);
        } else if votes(VOTE_FAIL) >= quorum {
            self.escrow.outcome = Some(Outcome::Fail);
        }
        // The deciding vote's hash is the escrow's record of what was judged.
        if self.escrow.outcome.is_some() {
            self.escrow.verdict_hash = verdict_hash;
        }

        Ok(())
    }
}
