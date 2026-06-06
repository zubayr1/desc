/**
 * @repo/shared — shared TS domain + API types (MVP, no-AI).
 *
 * Single source of truth for the contract lifecycle, imported by `web`,
 * `admin`, and `api` so they can't drift. AI-related types (moderator verdicts,
 * Helper-AI DTOs, no-consensus/disputed states) are intentionally absent — they
 * arrive with the `ai` service.
 */

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

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

/* Each enum is declared as an `as const` array (the runtime source of truth)
 * with its type derived from it — so a value list and a type come from ONE
 * declaration, importable by both compile-time and runtime code. */

export const ROLES = ["initiator", "committer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const DELIVERABLE_TYPES = [
  "merged_pr",
  "deployed_contract",
  "test_suite_pass",
  "technical_report",
] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

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

/** What the committer submits as proof of work. */
export interface Deliverable {
  /** Repo URL, tx signature, report text, etc. */
  payload: string;
  /** 32-byte hash recorded on-chain at submit, hex-encoded. */
  deliverableHash: string;
  submittedAt: Timestamp;
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
  moderatorSurcharge: TokenAmount;
  moderatorCount: number;

  // On-chain references
  escrowAddress: Address;
  vaultAddress: Address;

  // Onboarding — the shareable link the initiator sends the committer
  linkToken: string | null;

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
  deadline: Timestamp;
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
