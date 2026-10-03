use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::{Outcome, VOTE_FAIL, VOTE_NONE, VOTE_PASS};

/// A moderator's lifetime record (PDA, seeds = [b"mod_rep", moderator]).
///
/// Counters only — no authority, no funds. Written exclusively by `release` /
/// `refund`, as each panel seat is paid.
///
/// It lives here and not beside `Moderator` in `desc_moderation` because that
/// program already depends on this crate to CPI into `record_verdict`; the
/// reverse would be circular.
///
/// It has to exist because settlement CLOSES the escrow and the panel, and
/// neither program emits events — so without it the chain keeps no record that
/// a deal happened, and a moderator's track record would be our database's word.
#[account]
#[derive(InitSpace)]
pub struct ModeratorReputation {
    pub version: u8,
    /// The wallet this scores. Also the PDA seed.
    pub moderator: Pubkey,

    /// Verdicts paid on any panel size. Volume, and cheap to inflate — a
    /// moderator can seat itself on contracts it creates. Never show alone.
    pub verdicts_cast: u32,
    /// Verdicts on a panel of three or more: the accuracy denominator.
    pub panel_verdicts: u32,
    /// Of those, how many matched the outcome the panel settled on.
    pub majority_agreements: u32,
    /// How many of ALL votes were Fail — failing everything earns the same fee
    /// for near-zero work, so the bias is worth seeing before there is any
    /// stake to slash for it.
    pub fail_votes: u32,

    pub bump: u8,
    pub reserved: [u8; 48],
}

impl ModeratorReputation {
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, moderator].
    pub const SEED_PREFIX: &'static [u8] = b"mod_rep";

    /// Smallest panel on which agreement means anything. On a panel of one the
    /// moderator IS the majority, so it would read 100% forever. The gate also
    /// stops a moderator farming accuracy by seating itself alone.
    pub const MIN_PANEL_FOR_ACCURACY: u8 = 3;

    /// See `Escrow::check_version` for why this is `<=` and not `==`.
    pub fn check_version(&self) -> Result<()> {
        require!(
            self.version <= Self::VERSION,
            EscrowError::UnsupportedVersion
        );
        Ok(())
    }

    /// Fold one settled panel seat in. Called once per PAID seat from
    /// `settle_panel`, so scoring and payment can never disagree about who did the
    /// work.
    ///
    /// A seat that never voted is a no-op — it is not paid either, and counting
    /// silence as a verdict would reward not answering.
    ///
    /// Saturating, not checked: a counter pinning at `u32::MAX` beats a
    /// settlement that cannot execute.
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
