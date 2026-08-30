use anchor_lang::prelude::*;

/// On-chain lifecycle of an escrow — only the transitions that move money.
///
/// The richer off-chain contract states (draft, under_verification, disputed)
/// have no on-chain representation.
///
/// Invariant: once `Submitted`, funds are frozen until a verdict is recorded —
/// the deadline is irrelevant from that point. Pass -> committer, Fail ->
/// initiator, and nothing else can move the money.
///
/// APPEND-ONLY: borsh indexes variants by declaration order. New variants (e.g.
/// a future `Disputed`) must be added at the END — never reorder or insert.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum EscrowStatus {
    /// Initiator deposited; awaiting a committer to accept.
    /// Only state where the initiator may unilaterally `cancel`.
    Funded,
    /// Committer accepted -> working. No unilateral initiator cancel here.
    /// If `now > deadline` and nothing was submitted, the committer has ghosted
    /// and the initiator may `refund`.
    Active,
    /// Committer submitted before the deadline -> funds frozen pending a verdict.
    /// The deadline no longer applies; only `record_verdict` resolves this.
    Submitted,
    /// Verdict Pass -> released to committer.
    Settled,
    /// Returned to initiator (ghosting timeout, failed verdict, or mutual cancel).
    Refunded,
    /// Initiator cancelled before any committer accepted.
    Cancelled,
}

/// Aggregated verdict result, attested on-chain by the settlement authority.
/// The authority only *records* this; the parties themselves execute the
/// transfer (so payout never depends on the authority being online).
///
/// APPEND-ONLY: add new variants at the END only (see `EscrowStatus`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Outcome {
    Pass,
    Fail,
}

/// Per-deal escrow account (PDA, seeds = [b"escrow", initiator, contract_id]).
///
/// Holds the funds-relevant state for one contract. Subjective data (the
/// verdict reasoning, deliverable contents, criteria, moderator identities)
/// stays off-chain in V1; this account records only the money, the lifecycle,
/// and audit hashes of what was submitted and what verdict was acted on.
///
/// Backward-compat discipline:
/// - `version` is the first field (byte 8) for version dispatch / migrations.
/// - `reserved` is the LAST field. New fields are inserted immediately before
///   it and shrink it by their exact size, so the account size stays constant
///   (no `realloc`). Freed bytes are zeroed, so an added `Option<T>` reads None.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    /// Schema version of this account. Set to `VERSION` at init.
    pub version: u8,
    /// The protocol `Config` governing this escrow. Bound at creation so later
    /// instructions load the *current* `settlement_authority` / `treasury` live
    /// (keeping `settlement_authority` rotatable — the V1->V2 seam).
    pub config: Pubkey,
    pub initiator: Pubkey,
    /// None until the shareable link is accepted by a committer.
    pub committer: Option<Pubkey>,
    /// USDC mint used for this deal.
    pub mint: Pubkey,
    /// PDA token account holding the deposited funds.
    pub vault: Pubkey,

    /// Payout to the committer on success (USDC, 1e6 base units).
    pub amount: u64,
    /// Protocol fee, snapshotted at creation so a later Config change can't
    /// alter the agreed terms of an in-flight deal.
    pub protocol_fee: u64,
    /// What the moderators earn on this contract, in total.
    ///
    /// Priced PER MODERATOR, not as a pot to divide: every moderator runs the
    /// whole check — decrypt, rebuild, judge every criterion — so each is paid a
    /// full fee. A contract with `n` moderators costs the initiator `n ×` the
    /// per-moderator rate, and the alternative (one fee split `n` ways) is
    /// rejected: it would pay the fifth moderator a fifth as much for identical
    /// work, and no staked outside operator would take the job.
    ///
    /// V1 runs a single moderator, so this is that one fee and `release` pays it
    /// whole to `moderator`. Dividing it across a k-of-n set is V2 work.
    pub moderator_surcharge: u64,
    /// Number of moderators on this contract. Always 1 in V1 (0 when `no_mod`).
    pub moderator_count: u8,

    pub status: EscrowStatus,
    /// Set by `record_verdict`; None until a verdict is attested.
    pub outcome: Option<Outcome>,
    /// Hash of the aggregated verdict JSON the settlement acted on (zeroed until
    /// recorded). On-chain audit trail for the "neutral trust layer".
    pub verdict_hash: [u8; 32],
    /// Hash of the deliverable the committer submitted (zeroed until submitted).
    pub deliverable_hash: [u8; 32],

    /// Unix timestamp — submission deadline. Governs the ghosting refund only.
    pub deadline: i64,
    pub created_at: i64,
    /// When the committer submitted (None until `Submitted`). Off-chain SLA
    /// clock starts here; not used as an on-chain timer.
    pub submitted_at: Option<i64>,

    /// Links to the off-chain contract; also part of the PDA seed.
    pub contract_id: [u8; 16],
    pub bump: u8,
    pub vault_bump: u8,

    /// The moderator that recorded the verdict (set by `record_verdict`; zeroed
    /// until then). Receives the `moderator_surcharge` (its reward) on settle —
    /// on `release` (Pass) or `refund` (Fail). Carved from `reserved`.
    pub moderator: Pubkey,

    /// The non-refundable slice of `protocol_fee`, snapshotted at creation from
    /// `Config::protocol_fee_min`.
    ///
    /// Cost recovery for the verification itself: charged to the treasury
    /// whenever a moderator actually rendered a verdict — on `release` (Pass, as
    /// part of the full fee) and on `refund` (Fail, this slice only). The rest of
    /// `protocol_fee` goes back to the initiator on a Fail, so the protocol never
    /// *profits* from a failed deal but is never paid to *pass* one either.
    ///
    /// Zero when no floor is configured, and for escrows created before this
    /// field existed (their `reserved` was zeroed) — both mean "charge nothing on
    /// a Fail", i.e. the old fee-on-Pass-only behaviour. Carved from `reserved`.
    ///
    /// Invariant: `verification_fee <= protocol_fee`, since
    /// `protocol_fee = max(bps_fee, protocol_fee_min)`.
    pub verification_fee: u64,

    /// This escrow runs WITHOUT verification: the initiator opted out of
    /// moderation at creation, accepting the risk. `submit` then records a Pass
    /// straight away — there is no moderator, no surcharge, and no verification
    /// fee. Immutable once set; both parties can see it.
    ///
    /// Zero (false) for escrows created before this field existed, which is the
    /// moderated behaviour. Carved from `reserved`.
    pub no_mod: bool,

    /// Forward-compat padding so V2 fields (e.g. `parent`, `moderation_account`,
    /// `dispute_account`) can be added without a risky `realloc`. Carve new
    /// fields from here; keep this the LAST field.
    pub reserved: [u8; 87],
}

impl Escrow {
    /// Current schema version.
    pub const VERSION: u8 = 1;

    /// Seed prefix; full seeds = [SEED_PREFIX, initiator, contract_id].
    pub const SEED_PREFIX: &'static [u8] = b"escrow";
}
