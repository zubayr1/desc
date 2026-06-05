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

export type Role = "initiator" | "committer" | "admin";

export type DeliverableType =
  | "merged_pr"
  | "deployed_contract"
  | "test_suite_pass"
  | "technical_report";

/**
 * Contract lifecycle. Mirrors the program's on-chain `EscrowStatus` 1:1 — the
 * contract only exists once `create_escrow` lands on-chain, so it is born
 * `funded` (no off-chain `draft` state in the MVP).
 */
export type ContractStatus =
  | "funded"
  | "active"
  | "submitted"
  | "settled"
  | "refunded"
  | "cancelled";

/** Verdict result. Mirrors the program's on-chain `Outcome`.
 *  In the MVP this is set manually by the admin/settlement authority. */
export type Outcome = "pass" | "fail";

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

/** Register a contract once its `create_escrow` tx has landed on-chain. */
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
  /** On-chain `contract_id` chosen client-side, hex-encoded. */
  contractId: string;
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
