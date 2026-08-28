/**
 * @repo/shared — shared TS domain + API types (MVP, no-AI).
 *
 * Single source of truth for the contract lifecycle, imported by `web`,
 * `admin`, and `api` so they can't drift. AI-related types (moderator verdicts,
 * Helper-AI DTOs, no-consensus/disputed states) are intentionally absent — they
 * arrive with the `ai` service.
 */

// Deterministic deliverable bundling (validation + Merkle root). Used by `web`
// now; the `api` will reuse it as the verification authority later.
export * from "./bundle";

// Deliverable encryption — multi-recipient envelope (age). Browser encrypts to
// the moderators; a moderator service decrypts.
export * from "./crypto";

// ---------------------------------------------------------------------------
// Primitives / constants
// ---------------------------------------------------------------------------

/** Token amount in base units (1e6 for USDC), as a string to avoid u64
 *  precision loss in JS. */
export type TokenAmount = string;

/** Base58 wallet / account pubkey. */
export type Address = string;

/** ISO 8601 timestamp. */
export type Timestamp = string;

export const USDC_DECIMALS = 6;
export const DEFAULT_PROTOCOL_FEE_BPS = 200; // 2%
/** Minimum protocol fee in USDC base units ($1). The fee is
 *  max(2% of amount, this) — a floor so tiny contracts cover the fixed cost.
 *  The on-chain Config is the source of truth; this mirrors it for fee display. */
export const DEFAULT_PROTOCOL_FEE_MIN = 1_000_000;
/** Smallest contract the protocol escrows, in USDC base units ($50). Below this
 *  the fee floor would be a punitive share of the contract — at 2% + a $1 floor
 *  the two meet here. The on-chain Config is the source of truth. */
export const DEFAULT_MIN_AMOUNT = 50_000_000;
/** Moderator surcharge in basis points (1%), paid to the judging moderator on
 *  ANY verdict. Unlike the protocol fee this is a server-side rule, not an
 *  on-chain Config field — the client's value in a create request is ignored. */
export const MODERATOR_SURCHARGE_BPS = 100;
/** Moderators per contract in V1. */
export const MODERATOR_COUNT = 1;

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

/* Each enum is declared as an `as const` array (the runtime source of truth)
 * with its type derived from it — so a value list and a type come from ONE
 * declaration, importable by both compile-time and runtime code. */

export const ROLES = ["initiator", "committer", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Deliverable types — framed as what a moderator can verify **from the submitted
 * bundle alone**. A mod sees a sealed folder; it cannot observe external state
 * ("merged", "deployed", "live"), so every type is bundle-checkable. The Helper
 * AI must only emit acceptance criteria checkable from the bundle.
 */
export const DELIVERABLE_TYPES = [
  "mergeable",
  "deployable",
  "tests_pass",
  "spec_met",
] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

/** Display labels for the deliverable types — single source for web + admin. */
export const DELIVERABLE_TYPE_LABELS: Record<DeliverableType, string> = {
  mergeable: "Mergeable PR",
  deployable: "Deployable build",
  tests_pass: "Passing tests",
  spec_met: "Meets spec",
};

/** One-line hint per type — what's checkable from the submitted bundle. */
export const DELIVERABLE_TYPE_HINTS: Record<DeliverableType, string> = {
  mergeable: "A code change / PR bundle that applies and merges cleanly.",
  deployable: "A build or contract that compiles and deploys from the files.",
  tests_pass: "A test suite that passes when run on the submitted files.",
  spec_met: "Files that satisfy a written spec the moderator can check directly.",
};

/**
 * Contract lifecycle. Mirrors the program's on-chain `EscrowStatus` 1:1 — the
 * contract only exists once `create_escrow` lands on-chain, so it is born
 * `funded` (no off-chain `draft` state in the MVP).
 */
export const CONTRACT_STATUSES = [
  "funded",
  "active",
  "submitted",
  "settled",
  "refunded",
  "cancelled",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Verdict result. Mirrors the program's on-chain `Outcome`.
 *  In the MVP this is set manually by the admin/settlement authority. */
export const OUTCOMES = ["pass", "fail"] as const;
export type Outcome = (typeof OUTCOMES)[number];

// ---------------------------------------------------------------------------
// Off-chain entities
// ---------------------------------------------------------------------------

/** A single checkable acceptance criterion (hand-typed in the MVP). */
export interface AcceptanceCriterion {
  id: string;
  description: string;
}

/**
 * What the committer delivered — a content-addressed bundle, **sealed**
 * (encrypted to the moderators). The server stores only the ciphertext + these
 * anchors; the file list is inside the ciphertext, visible only after a moderator
 * decrypts (or the initiator on PASS).
 */
export interface Deliverable {
  /** sha256(manifest) recorded on-chain at submit, hex-encoded. */
  deliverableHash: string;
  /** Merkle root over the files (R_plain), hex-encoded. */
  root: string;
  submittedAt: Timestamp;
}

/** Committer uploads the encrypted bundle (server stores it blind). */
export interface DeliverableUploadRequest {
  deliverableHash: string;
  root: string;
  /** age ciphertext of the canonical bundle blob, base64-encoded. */
  ciphertext: string;
}

/**
 * The contract record — ties the off-chain metadata (brief, criteria, link) to
 * the on-chain escrow. Created when the funding tx confirms.
 */
export interface Contract {
  /** Off-chain id (e.g. uuid). */
  id: string;
  /** On-chain `contract_id` ([u8;16]), hex-encoded. */
  contractId: string;
  status: ContractStatus;

  // Parties
  initiator: Address;
  committer: Address | null;

  // Terms (off-chain metadata, not stored on-chain)
  title: string;
  brief: string;
  deliverableType: DeliverableType;
  acceptanceCriteria: AcceptanceCriterion[];

  // Money (base units)
  mint: Address;
  amount: TokenAmount;
  protocolFee: TokenAmount;
  /** The slice of `protocolFee` the treasury keeps when a moderator renders a
   *  verdict — on a Pass (inside the full fee) or a Fail (this much only). The
   *  rest of the fee is returned on a Fail, and nothing at all is charged on a
   *  ghost-timeout or a cancel. Cost recovery, not margin. */
  verificationFee: TokenAmount;
  moderatorSurcharge: TokenAmount;
  moderatorCount: number;
  /** The initiator opted out of moderation: no moderator, no surcharge, no
   *  verification fee, and submission passes automatically. Visible to both
   *  parties — the committer can see the work won't be checked. */
  noMod: boolean;

  // On-chain references
  escrowAddress: Address;
  vaultAddress: Address;

  // Onboarding — the shareable link the initiator sends the committer
  linkToken: string | null;

  /** The initiator's age recipient (derived from a wallet signature). The
   *  committer seals the deliverable to this too, so a Pass delivers the exact
   *  verified bytes. Null if the initiator didn't enrol an encryption key. */
  initiatorRecipient: string | null;

  // Verification (manual in MVP; null until a verdict is recorded)
  outcome: Outcome | null;
  deliverable: Deliverable | null;

  // Timing
  deadline: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// API DTOs (api ⇄ web/admin)
// ---------------------------------------------------------------------------

/** Draft a contract + get back the unsigned `create_escrow` tx to sign.
 *  The api generates the on-chain `contract_id` server-side. */
export interface CreateContractRequest {
  initiator: Address;
  title: string;
  brief: string;
  deliverableType: DeliverableType;
  acceptanceCriteria: Array<{ description: string }>;
  amount: TokenAmount;
  moderatorCount: number;
  moderatorSurcharge: TokenAmount;
  /** Opt out of moderation. Count and surcharge are recomputed server-side. */
  noMod?: boolean;
  deadline: Timestamp;
  /** The initiator's age recipient, derived client-side from a wallet signature.
   *  Optional — if absent, the deliverable is sealed to the moderators only. */
  initiatorRecipient?: string;
}

/** Live fee parameters (`GET /config/fees`). The first three come from the
 *  on-chain Config — the authoritative source — so the UI never has to guess at
 *  what the wallet will actually be asked to sign. Amounts are base units. */
export interface FeeConfig {
  protocolFeeBps: number;
  protocolFeeMin: TokenAmount;
  minAmount: TokenAmount;
  moderatorSurchargeBps: number;
  moderatorCount: number;
}

/** Response to `POST /contracts` — the unsigned tx for the wallet to sign. */
export interface CreateContractResponse {
  id: string;
  contractId: string;
  escrowAddress: Address;
  /** Base64 serialized unsigned transaction. */
  unsignedTx: string;
}

/** Body for any submit endpoint — the wallet-signed transaction. */
export interface SubmitTxRequest {
  /** Base64 serialized signed transaction. */
  signedTx: string;
}

/** Committer opens the shareable link and accepts. */
export interface AcceptContractRequest {
  linkToken: string;
  committer: Address;
}

export interface SubmitDeliverableRequest {
  payload: string;
}

/** Admin/manual verdict (the stand-in for AI moderators in the MVP). */
export interface RecordVerdictRequest {
  outcome: Outcome;
  /** Optional reviewer note for the audit trail. */
  note?: string;
}
