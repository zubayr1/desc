use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, Outcome, Panel, VOTE_FAIL, VOTE_NONE, VOTE_PASS};

/// Record ONE moderator's vote, and set the outcome once a majority of the
/// panel agrees. Attestation only — no money moves; the parties then execute
/// `release` (Pass) or `refund` (Fail).
///
/// The first side to reach quorum decides; the remaining moderators are not
/// waited for. Waiting on everyone would make a stuck escrow more likely as the
/// panel grows, where majority rule goes the other way: three tolerates one
/// silent moderator, five tolerates two.
///
/// A late vote is still recorded, paid and scored — it judged the same
/// deliverable. It just cannot move an outcome already final. Votes stop at
/// settlement, when the escrow leaves `Submitted`.
///
/// The authority is read live from the bound `Config`, so it stays rotatable.
/// Today it is the `desc_moderation` verdict PDA, reached only by CPI.
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
        // A decided escrow deliberately does NOT reject further votes; only
        // their influence on the outcome is gone.

        // Only a seated moderator may vote — one whose price the initiator paid.
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

        // Tally only while open: the first side to reach quorum decides.
        // `quorum` was snapshotted at creation, so a later rule change cannot
        // shift the goalposts on a live deal.
        if self.escrow.outcome.is_none() {
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
            // The deciding vote's hash is the escrow's record; each seat keeps
            // its own, so a minority verdict stays auditable.
            if self.escrow.outcome.is_some() {
                self.escrow.verdict_hash = verdict_hash;
            }
        }

        Ok(())
    }
}
