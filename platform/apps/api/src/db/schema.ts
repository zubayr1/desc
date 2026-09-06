import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import type { AcceptanceCriterion, ContractStatus, Outcome } from "@repo/shared";

/**
 * Off-chain moderation progress — see the `moderationState` column for the
 * state machine. Not an on-chain concept.
 */
export type ModerationState = "in_progress" | "done" | "failed";

/**
 * Off-chain contract metadata. The chain is the source of truth for status,
 * committer, amounts, and outcome — but status/committer/outcome are *cached*
 * here (write-through) so dashboards are queryable without N chain reads.
 */
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // On-chain linkage
    contractId: text("contract_id").notNull().unique(), // hex [u8;16]
    escrowAddress: text("escrow_address").notNull(),
    vaultAddress: text("vault_address").notNull(),

    // Parties / terms (off-chain metadata)
    initiator: text("initiator").notNull(),
    title: text("title").notNull(),
    brief: text("brief").notNull(),
    deliverableType: text("deliverable_type").notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<AcceptanceCriterion[]>()
      .notNull(),

    // Money (base units, text mirrors)
    mint: text("mint").notNull(),
    amount: text("amount").notNull(),
    protocolFee: text("protocol_fee").notNull(),
    // Non-refundable slice of the fee, kept once a verdict exists (Pass or Fail).
    // Mirrors the escrow's snapshotted `verification_fee`.
    verificationFee: text("verification_fee").notNull().default("0"),
    moderatorSurcharge: text("moderator_surcharge").notNull(),
    moderatorCount: integer("moderator_count").notNull(),
    // Initiator opted out of moderation. Mirrors the escrow's `no_mod`.
    noMod: boolean("no_mod").notNull().default(false),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),

    // Cached on-chain state (read model) — refreshed by write-through on each
    // flow. Null until the escrow is funded on-chain.
    status: text("status").$type<ContractStatus>(),
    committer: text("committer"),
    outcome: text("outcome").$type<Outcome>(),

    // Onboarding
    linkToken: text("link_token").unique(),

    // The initiator's age recipient (derived client-side from a wallet signature).
    // The committer seals the deliverable to this too, so a Pass delivers the
    // exact verified bytes. Null if the initiator didn't enrol a key.
    initiatorRecipient: text("initiator_recipient"),

    // Deliverable bundle — sealed (ciphertext in storage). Server keeps only the
    // anchors; the file list lives inside the ciphertext. submittedAt on confirm.
    deliverableHash: text("deliverable_hash"), // sha256(manifest), on-chain anchor
    deliverableRoot: text("deliverable_root"), // Merkle root (R_plain)
    deliverableStorageKey: text("deliverable_storage_key"),
    deliverableSubmittedAt: timestamp("deliverable_submitted_at", {
      withTimezone: true,
    }),

    // Verdict note (manual/admin context in the MVP)
    verdictNote: text("verdict_note"),

    // --- Moderation progress (OFF-CHAIN worker bookkeeping) -----------------
    // Deliberately NOT part of `status`: that column is a cache of on-chain
    // state and the reconciler rewrites it every sweep, so anything invented
    // there is erased. The chain has no concept of "being moderated" — that
    // only exists between a deliverable landing and `submit_verdict`.
    //
    // Only meaningful while status = "submitted"; null everywhere else.
    //   null         — delivered, no moderator has picked it up
    //   in_progress  — a moderator claimed it (see moderationStartedAt for the lease)
    //   done         — a verdict was submitted; terminal, never re-judged
    //   failed       — cannot be judged; never retried, needs a human
    moderationState: text("moderation_state").$type<ModerationState>(),
    /** Bumped on each claim, so a contract that keeps failing is visible. */
    moderationAttempts: integer("moderation_attempts").notNull().default(0),
    /** Why it could not be judged. Safe to show a user. */
    moderationError: text("moderation_error"),
    /** When the claim was taken. A worker that dies leaves this stale, and the
     *  claim is reclaimable once it ages past the lease. */
    moderationStartedAt: timestamp("moderation_started_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("contracts_initiator_idx").on(t.initiator),
    index("contracts_status_idx").on(t.status),
  ]
);

export type ContractRow = typeof contracts.$inferSelect;
export type NewContractRow = typeof contracts.$inferInsert;
