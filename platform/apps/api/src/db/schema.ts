import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import type {
  AcceptanceCriterion,
  ContractModerator,
  ContractStatus,
  Outcome,
} from "@repo/shared";

/**
 * Off-chain moderation progress for ONE moderator on ONE contract — see
 * `moderationClaims`. Not an on-chain concept.
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

    // The panel assigned at creation: every moderator judging this contract,
    // with its age recipient and its own snapshotted price, in the same order as
    // the on-chain `Panel`. The committer seals the delivery to exactly these
    // recipients — sealing to every REGISTERED moderator would let one read work
    // it was never given. Empty for no-mod contracts.
    panel: jsonb("panel").$type<ContractModerator[]>().notNull().default([]),

    // Legacy mirrors of a ONE-seat panel, kept only while `mod-watch` still
    // claims work by this column (replaced by the per-moderator claims table).
    // Null on a no-mod contract AND on a panel of three — read `panel` instead.
    moderator: text("moderator"),
    moderatorRecipient: text("moderator_recipient"),

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

    // Moderation progress used to live here as four columns. It moved to
    // `moderationClaims`: one column per contract cannot say "Hikaru is judging,
    // SonGoku has already voted", which is the normal state of a panel of three.

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

/**
 * One moderator's progress on one contract — the panel's work queue.
 *
 * This replaces the four `moderation_*` columns that used to sit on `contracts`.
 * A single column per contract can hold exactly one state, which was fine while
 * exactly one moderator judged each deal; with a panel of three the normal state
 * is "Hikaru is judging, SonGoku has voted, Olympus has not started", and one
 * column cannot say that. Worse, three watchers would fight over the same value
 * and each believe it had claimed the work.
 *
 * The primary key is (contract, moderator), so a claim is per SEAT: each
 * moderator claims, judges, and finishes its own row without touching anyone
 * else's.
 *
 * States, all meaningful only while the contract is `submitted`:
 *   (no row)     — this moderator has not picked the contract up
 *   in_progress  — claimed (see `startedAt` for the lease)
 *   done         — this moderator's verdict is in; terminal, never re-judged
 *   failed       — this moderator cannot judge it; never retried, needs a human
 */
export const moderationClaims = pgTable(
  "moderation_claims",
  {
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    /** The moderator's wallet — its seat on the contract's panel. */
    moderator: text("moderator").notNull(),
    state: text("state").$type<ModerationState>().notNull(),
    /** Bumped on each claim, so a seat that keeps failing is visible. */
    attempts: integer("attempts").notNull().default(0),
    /** Why this moderator could not judge it. Safe to show a user. */
    error: text("error"),
    /** When the claim was taken. A worker that dies leaves this stale, and the
     *  claim is reclaimable once it ages past the lease. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.contractId, t.moderator] }),
    index("moderation_claims_moderator_idx").on(t.moderator, t.state),
  ]
);

export type ModerationClaimRow = typeof moderationClaims.$inferSelect;
