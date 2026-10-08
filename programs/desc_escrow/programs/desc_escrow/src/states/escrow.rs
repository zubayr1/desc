use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::states::Panel;

/// On-chain lifecycle — only the transitions that move money. The richer
/// off-chain states (draft, under_verification, disputed) have no on-chain form.
///
/// Invariant: once `Submitted`, funds are frozen until a verdict is recorded.
/// The deadline stops applying from that point.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum EscrowStatus {
    /// Funded, awaiting a committer. The only state the initiator may `cancel`.
    Funded,
    /// Accepted, work in progress. Past `deadline` with nothing submitted, the
    /// committer has ghosted and the initiator may `refund`.
    Active,
    /// Submitted in time; frozen until `record_verdict`.
    Submitted,
    /// Pass — released to the committer.
    Settled,
    /// Returned to the initiator: ghosting, a Fail verdict, or mutual cancel.
    Refunded,
    /// Cancelled before any committer accepted.
    Cancelled,
}

/// The verdict, attested by the settlement authority. The authority only
/// *records* it; the parties execute the transfer, so payout never depends on
/// the authority being online.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Outcome {
    Pass,
    Fail,
    /// No majority even after the tiebreakers.
    Inconclusive,
}

/// Per-deal escrow (PDA, seeds = [b"escrow", initiator, contract_id]).
///
/// Records the money, the lifecycle and audit hashes. Everything subjective —
/// verdict reasoning, deliverable contents, criteria — stays off-chain.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub version: u8,
    /// The governing `Config`. Bound at creation, but read live, so
    /// `settlement_authority` and `treasury` stay rotatable.
    pub config: Pubkey,
    pub initiator: Pubkey,
    /// None until a committer accepts the shareable link.
    pub committer: Option<Pubkey>,
    pub mint: Pubkey,
    /// PDA token account holding the deposit.
    pub vault: Pubkey,

    /// Payout to the committer on success.
    pub amount: u64,
    /// Snapshotted at creation, so a later `Config` change cannot alter the
    /// terms of a live deal.
    pub protocol_fee: u64,
    /// What the panel earns in total — the sum of each seat's own fee, never one
    /// fee divided up. Every moderator runs the whole check, so each is paid in
    /// full and `n` moderators cost `n ×` the rate.
    pub moderator_surcharge: u64,
    /// Seats on the panel: 0 (no-mod), 1 or 3.
    pub moderator_count: u8,

    pub status: EscrowStatus,
    /// None until a verdict is attested.
    pub outcome: Option<Outcome>,
    /// sha256 of the verdict acted on. Zeroed until recorded.
    pub verdict_hash: [u8; 32],
    /// sha256 of the submitted deliverable. Zeroed until submitted.
    pub deliverable_hash: [u8; 32],

    /// Submission deadline. Governs the ghosting refund only.
    pub deadline: i64,
    pub created_at: i64,
    /// Off-chain SLA clock; never used as an on-chain timer.
    pub submitted_at: Option<i64>,

    /// Links to the off-chain contract; also part of the PDA seed.
    pub contract_id: [u8; 16],
    pub bump: u8,
    pub vault_bump: u8,

    /// Set only on a ONE-seat escrow. `Pubkey::default()` on a panel of three
    /// and on no-mod — read `panel` instead.
    pub moderator: Pubkey,

    /// The non-refundable slice of `protocol_fee`. Charged whenever a moderator
    /// actually rendered a verdict, so the protocol recovers the cost of a Fail
    /// without profiting from one. Zero means the old fee-on-Pass-only
    /// behaviour.
    ///
    /// Invariant: `verification_fee <= protocol_fee`.
    pub verification_fee: u64,

    /// Initiator opted out of moderation. `submit` then records a Pass straight
    /// away: no moderator, no surcharge, no verification fee.
    pub no_mod: bool,

    // The assigned moderator's price, copied at creation so a later change
    // cannot alter a struck deal. `moderator_surcharge` is the resulting
    // CEILING; with size pricing rejected (V1) the ceiling IS the fee.
    pub base_bps: u16,
    /// Always 0 until size pricing ships.
    pub fee_per_kb: u64,
    /// 0 = no limit.
    pub max_bundle_kb: u32,

    /// This escrow's `Panel`. One exists for every escrow, including no-mod
    /// (`count == 0`), so settlement has a single shape to handle.
    pub panel: Pubkey,

    /// Snapshotted from `Config` so a config change can't move a live deadline.
    pub verdict_window: i64,
    /// Panel of 1: the vote deadline.
    pub commit_deadline: i64,
    /// Panel of 1: equals `commit_deadline`.
    pub reveal_deadline: i64,

    pub reserved: [u8; 17],
}

impl Escrow {
    pub const VERSION: u8 = 2;

    pub const DEFAULT_VERDICT_WINDOW: i64 = 3_600;

    /// Seed prefix; full seeds = [SEED_PREFIX, initiator, contract_id].
    pub const SEED_PREFIX: &'static [u8] = b"escrow";

    /// Reject an account written by a NEWER program than this one.
    ///
    /// `<=` and never `==`: old accounts must stay readable, and `==` would
    /// brick every escrow created before a bump — funds locked, no instruction
    /// callable. What this catches is the reverse, a stale deployment, which
    /// borsh would otherwise hide by ignoring trailing bytes.
    pub fn check_version(&self) -> Result<()> {
        require!(
            self.version <= Self::VERSION,
            EscrowError::UnsupportedVersion
        );
        Ok(())
    }

    pub fn window(&self) -> i64 {
        if self.verdict_window > 0 {
            self.verdict_window
        } else {
            Self::DEFAULT_VERDICT_WINDOW
        }
    }

    pub fn reveal_open(&self, panel: &Panel, now: i64) -> bool {
        panel.all_committed() || now > self.commit_deadline
    }

    pub fn voting_closed(&self, now: i64) -> bool {
        now > self.reveal_deadline
    }

    pub fn tiebreak_deadline(&self, panel: &Panel) -> i64 {
        self.reveal_deadline
            .saturating_add(self.window().saturating_mul(panel.tiebreak_cap() as i64))
    }

    /// A committed seat always gets its full reveal window before settlement.
    pub fn settlement_ready(&self, panel: &Panel, now: i64) -> bool {
        !panel.has_unrevealed() || self.voting_closed(now)
    }

    /// The most a moderator can charge here — what the initiator locks up front.
    pub fn moderation_ceiling(
        amount: u64,
        base_bps: u16,
        fee_per_kb: u64,
        max_bundle_kb: u32,
    ) -> Result<u64> {
        let base = (amount as u128)
            .checked_mul(base_bps as u128)
            .and_then(|v| v.checked_div(10_000));
        let size = (fee_per_kb as u128).checked_mul(max_bundle_kb as u128);
        base.zip(size)
            .and_then(|(b, z)| b.checked_add(z))
            .and_then(|v| u64::try_from(v).ok())
            .ok_or(error!(EscrowError::MathOverflow))
    }
}
