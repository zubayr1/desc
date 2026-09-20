use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, Outcome, Panel, VOTE_FAIL, VOTE_NONE, VOTE_PASS};

/// The settlement authority records ONE moderator's vote on a submitted escrow,
/// and sets the outcome once a majority of its panel agrees. Attestation only —
/// no money moves; the parties then execute `release` (Pass) or `refund` (Fail)
/// themselves.
///
/// A panel of one is decided by its single vote. A panel of three is decided the
/// moment two moderators agree — the third is not waited for, because with three
/// judges two that agree are a majority whatever the third says.
///
/// Why not wait for the whole panel? Liveness. Waiting needs EVERY moderator to
/// answer, so the odds of a stuck escrow grow as `q^n` with panel size, and get
/// worse again once moderators are outside operators we do not run. A majority
/// rule goes the other way: a panel of three tolerates one silent moderator, a
/// panel of five tolerates two.
///
/// A vote that arrives after the outcome is set is still RECORDED on the panel
/// and still PAID — it judged the same deliverable and earned its fee, and its
/// vote is the record a future reputation system scores. It simply cannot move
/// an outcome that is already final. Votes stop being accepted at settlement,
/// when `release` / `refund` moves the escrow out of `Submitted`.
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
        // NOTE: a decided escrow deliberately does NOT reject further votes. A
        // moderator still judging when the majority formed is recorded and paid
        // like the rest; only its influence on the outcome is gone.

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

        // Tally only while the escrow is still open. The FIRST side to reach
        // quorum decides, and nothing after that moves it. `quorum` was
        // snapshotted at creation, so a later rule change cannot shift the
        // goalposts on a live deal.
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
            // The deciding vote's hash is the escrow's record of what was
            // judged; every moderator's own hash stays on its panel seat, so a
            // minority verdict is still auditable.
            if self.escrow.outcome.is_some() {
                self.escrow.verdict_hash = verdict_hash;
            }
        }

        Ok(())
    }
}
