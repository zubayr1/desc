use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::states::Outcome;

/// One moderator's seat: who, what they are owed, and how they voted.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct PanelEntry {
    pub moderator: Pubkey,
    /// Snapshotted at creation; paid only if it votes. A tiebreaker inherits it.
    pub fee: u64,
    pub vote: u8,
    /// The commit hash while `VOTE_COMMITTED`, the verdict hash once revealed.
    pub verdict_hash: [u8; 32],
}

pub const VOTE_NONE: u8 = 0;
pub const VOTE_PASS: u8 = 1;
pub const VOTE_FAIL: u8 = 2;
pub const VOTE_COMMITTED: u8 = 3;

pub fn is_cast(vote: u8) -> bool {
    vote == VOTE_PASS || vote == VOTE_FAIL
}

/// `Inconclusive` is a result, never a vote.
pub fn vote_byte(outcome: Outcome) -> Option<u8> {
    match outcome {
        Outcome::Pass => Some(VOTE_PASS),
        Outcome::Fail => Some(VOTE_FAIL),
        Outcome::Inconclusive => None,
    }
}

/// Moderator and escrow are in the preimage so a commit can't be replayed elsewhere.
pub fn commit_hash(
    vote: u8,
    verdict_hash: &[u8; 32],
    salt: &[u8; 32],
    moderator: &Pubkey,
    escrow: &Pubkey,
) -> [u8; 32] {
    hashv(&[&[vote], verdict_hash, salt, moderator.as_ref(), escrow.as_ref()]).to_bytes()
}

/// The moderators judging one escrow (PDA, seeds = [b"panel", escrow]).
///
/// Separate from the escrow because three pubkeys plus votes outgrow its
/// remaining `reserved` space. One exists per escrow, including no-mod
/// (`count == 0`), so settlement has a single shape to handle. Rent is paid by
/// the initiator and returned to it when the panel closes on settle.
#[account]
#[derive(InitSpace)]
pub struct Panel {
    pub version: u8,
    pub escrow: Pubkey,
    /// Seats filled: 0 (no-mod), 1 or 3. Never even above zero — a tie has no
    /// majority.
    pub count: u8,
    /// Votes needed to decide: `count / 2 + 1`. Snapshotted so a later rule
    /// change cannot move the goalposts on a live deal.
    pub quorum: u8,
    /// Only the first `count` are used.
    pub entries: [PanelEntry; Panel::MAX_SEATS],
    pub bump: u8,
    pub tiebreak_fills: u8,
    pub reserved: [u8; 63],
}

impl Panel {
    pub const VERSION: u8 = 2;

    /// Seed prefix; full seeds = [SEED_PREFIX, escrow].
    pub const SEED_PREFIX: &'static [u8] = b"panel";

    /// Odd sizes only, so 1 or 3.
    pub const MAX_SEATS: usize = 3;

    /// Even panels are rejected: a tie has no majority and the escrow would sit
    /// unsettleable.
    pub fn is_valid_size(count: u8) -> bool {
        count == 0 || count == 1 || count == 3
    }

    pub fn seats(&self) -> &[PanelEntry] {
        &self.entries[..self.count as usize]
    }

    /// A single moderator has nobody to copy, so it votes directly.
    pub fn uses_commit_reveal(&self) -> bool {
        self.count > 1
    }

    pub fn tiebreak_cap(&self) -> u8 {
        match self.count {
            0 => 0,
            1 => 1,
            n => n - 1,
        }
    }

    pub fn seat_of(&self, moderator: &Pubkey) -> Option<usize> {
        self.seats().iter().position(|e| e.moderator == *moderator)
    }

    pub fn all_committed(&self) -> bool {
        self.seats().iter().all(|e| e.vote != VOTE_NONE)
    }

    pub fn has_unrevealed(&self) -> bool {
        self.seats().iter().any(|e| e.vote == VOTE_COMMITTED)
    }

    /// Picked by the program, so a tiebreaker can't choose the biggest fee.
    pub fn first_silent(&self) -> Option<usize> {
        self.seats().iter().position(|e| !is_cast(e.vote))
    }

    pub fn majority(&self) -> Option<Outcome> {
        let count = |v: u8| self.seats().iter().filter(|e| e.vote == v).count() as u8;
        if count(VOTE_PASS) >= self.quorum {
            Some(Outcome::Pass)
        } else if count(VOTE_FAIL) >= self.quorum {
            Some(Outcome::Fail)
        } else {
            None
        }
    }
}
