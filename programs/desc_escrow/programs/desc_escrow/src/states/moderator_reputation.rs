use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Outcome, VOTE_FAIL, VOTE_NONE, VOTE_PASS};

/// A moderator's lifetime record (PDA, seeds = [b"mod_rep", moderator]).
///
/// Counters only. No authority, no funds, nothing to pause or steal — the worst
/// an attacker who could write it arbitrarily would achieve is a wrong number on
/// a web page. It is written exclusively by `release` / `refund`, as each panel
/// seat is paid.
///
/// It lives in THIS program, not in `desc_moderation` alongside `Moderator`,
/// because `desc_moderation` already depends on this crate to CPI into
/// `record_verdict` — the reverse would be circular. Both halves of the
/// comparison (the settled `Escrow::outcome` and each seat's vote on the
/// `Panel`) are accounts of this program anyway.
///
/// Why it has to exist at all: `release`, `refund` and `cancel` all close the
/// escrow and the panel, and neither program emits an event. Once a deal
/// settles the chain keeps no record that it happened, so without this account
/// a moderator's track record would be our database's word.
///
/// Backward-compat discipline:
/// - `version` is the first field (byte 8) for version dispatch / migrations.
/// - `reserved` is the LAST field. New fields are inserted immediately before
///   it and shrink it by their exact size, so the account size stays constant
///   (no `realloc`). Freed bytes are zeroed, so an added `Option<T>` reads None.
#[account]
#[derive(InitSpace)]
pub struct ModeratorReputation {
    /// Schema version of this account. Set to `VERSION` at init.
    pub version: u8,
    /// The moderator wallet this scores. Also the PDA seed, so the account
    /// cannot be pointed at a different moderator after creation.
    pub moderator: Pubkey,

    /// Every vote this moderator has had paid, on any panel size. Volume, not
    /// quality — and cheap to inflate, since a moderator can be seated on
    /// contracts it creates itself. Not a number to show on its own.
    pub verdicts_cast: u32,
    /// Votes cast on a panel of three or more: the accuracy denominator.
    /// Separate from `verdicts_cast` because a panel of one has no majority to
    /// agree with (see `MIN_PANEL_FOR_ACCURACY`).
    pub panel_verdicts: u32,
    /// Of those, how many matched the outcome the panel actually settled on.
    pub majority_agreements: u32,
    /// How many of ALL votes were Fail. A moderator that fails everything earns
    /// the same fee for near-zero work, so the bias is worth seeing long before
    /// there is any stake to slash for it.
    pub fail_votes: u32,

    pub bump: u8,
    /// Forward-compat padding (V2: stake, slashing history, …). Carve new
    /// fields from here; keep it LAST.
    pub reserved: [u8; 48],
}

impl ModeratorReputation {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, moderator].
    pub const SEED_PREFIX: &'static [u8] = b"mod_rep";

    /// Smallest panel on which agreement means anything.
    ///
    /// On a panel of one the moderator IS the majority, so it would agree with
    /// itself every time and read 100% forever — worse than reading nothing.
    /// The gate pays for itself twice: a moderator cannot farm accuracy by
    /// seating itself alone on contracts it creates, because to move this
    /// number it has to be seated beside two others and actually agree with
    /// them.
    pub const MIN_PANEL_FOR_ACCURACY: u8 = 3;

    /// Reject an account written by a NEWER program than this one. See
    /// `Escrow::check_version` for why this is `<=` and not `==`.
    pub fn check_version(&self) -> Result<()> {
        require!(
            self.version <= Self::VERSION,
            EscrowError::UnsupportedVersion
        );
        Ok(())
    }

    /// Fold one settled panel seat into this record.
    ///
    /// Called once per paid seat from `pay_panel`, so scoring and payment can
    /// never disagree about who did the work: a moderator is scored exactly
    /// when it is paid, and an escrow that never settles does neither.
    ///
    /// A seat that never voted is a no-op — it is not paid either, and counting
    /// silence as a verdict would reward not answering.
    ///
    /// Saturating rather than checked: at `u32::MAX` this is four billion
    /// verdicts, and a counter quietly pinning at its ceiling is a far better
    /// outcome than a settlement that cannot execute because a moderator has
    /// judged too many deals.
    pub fn record(&mut self, vote: u8, outcome: Outcome, panel_count: u8) {
        if vote == VOTE_NONE {
            return;
        }

        self.verdicts_cast = self.verdicts_cast.saturating_add(1);
        if vote == VOTE_FAIL {
            self.fail_votes = self.fail_votes.saturating_add(1);
        }

        if panel_count < Self::MIN_PANEL_FOR_ACCURACY {
            return;
        }
        self.panel_verdicts = self.panel_verdicts.saturating_add(1);

        let agreed = match outcome {
            Outcome::Pass => vote == VOTE_PASS,
            Outcome::Fail => vote == VOTE_FAIL,
        };
        if agreed {
            self.majority_agreements = self.majority_agreements.saturating_add(1);
        }
    }
}
