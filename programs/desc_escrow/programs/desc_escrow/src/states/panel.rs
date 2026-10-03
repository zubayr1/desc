use anchor_lang::prelude::*;

/// One moderator's seat: who, what they are owed, and how they voted.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct PanelEntry {
    /// The wallet that signs this seat's verdict.
    pub moderator: Pubkey,
    /// Its own price for THIS contract, snapshotted at creation. Paid on settle
    /// only if it voted; otherwise returned to the initiator.
    pub fee: u64,
    pub vote: u8,
    /// sha256 of the verdict signed. Zero until it votes.
    pub verdict_hash: [u8; 32],
}

pub const VOTE_NONE: u8 = 0;
pub const VOTE_PASS: u8 = 1;
pub const VOTE_FAIL: u8 = 2;

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
    pub reserved: [u8; 64],
}

impl Panel {
    pub const VERSION: u8 = 1;

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
}
