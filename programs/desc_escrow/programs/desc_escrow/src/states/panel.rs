use anchor_lang::prelude::*;

/// A moderator's seat on an escrow's panel: who they are, what they are owed,
/// and how they voted.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct PanelEntry {
    /// The moderator's wallet — the key that signs its verdict.
    pub moderator: Pubkey,
    /// Its own price for THIS contract, snapshotted at creation. Paid on settle
    /// only if it voted; otherwise it returns to the initiator.
    pub fee: u64,
    /// `VOTE_NONE` until it votes, then `VOTE_PASS` / `VOTE_FAIL`.
    pub vote: u8,
    /// sha256 of the verdict this moderator signed. Zero until it votes.
    pub verdict_hash: [u8; 32],
}

pub const VOTE_NONE: u8 = 0;
pub const VOTE_PASS: u8 = 1;
pub const VOTE_FAIL: u8 = 2;

/// The moderators judging one escrow, and their votes (PDA, seeds =
/// [b"panel", escrow]).
///
/// A separate account because the escrow cannot hold three moderators plus
/// their votes — three pubkeys alone outgrow its remaining `reserved` space.
///
/// One panel exists per escrow, including a no-mod escrow (`count == 0`), so
/// every settlement path has exactly one shape to handle. Its rent is paid by
/// the initiator at creation and returns to the initiator when the panel is
/// closed on settle.
///
/// Backward-compat discipline: `version` first, `reserved` LAST.
#[account]
#[derive(InitSpace)]
pub struct Panel {
    /// Schema version of this account. Set to `VERSION` at init.
    pub version: u8,
    /// The escrow this panel judges. Bound at creation.
    pub escrow: Pubkey,
    /// How many seats are filled: 0 (no-mod), 1 or 3. Never even above zero —
    /// a tie has no majority.
    pub count: u8,
    /// Votes needed for an outcome: `count / 2 + 1`. Snapshotted so a later
    /// rule change cannot move the goalposts on a live deal.
    pub quorum: u8,
    /// Seats. Only the first `count` are used.
    pub entries: [PanelEntry; Panel::MAX_SEATS],
    pub bump: u8,
    /// Forward-compat padding. Carve new fields from here; keep it LAST.
    pub reserved: [u8; 64],
}

impl Panel {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, escrow].
    pub const SEED_PREFIX: &'static [u8] = b"panel";

    /// Most moderators one escrow may carry. Odd sizes only, so 1 or 3.
    pub const MAX_SEATS: usize = 3;

    /// Is `count` a legal panel size? Even panels are rejected because a tie
    /// has no majority, and the escrow would sit unsettleable.
    pub fn is_valid_size(count: u8) -> bool {
        count == 0 || count == 1 || count == 3
    }

    /// The seats actually in use.
    pub fn seats(&self) -> &[PanelEntry] {
        &self.entries[..self.count as usize]
    }
}
