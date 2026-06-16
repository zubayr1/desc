import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type {
  AcceptanceCriterion,
  ContractStatus,
  Manifest,
  Outcome,
} from "@repo/shared";

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
    moderatorSurcharge: text("moderator_surcharge").notNull(),
    moderatorCount: integer("moderator_count").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),

    // Cached on-chain state (read model) — refreshed by write-through on each
    // flow. Null until the escrow is funded on-chain.
    status: text("status").$type<ContractStatus>(),
    committer: text("committer"),
    outcome: text("outcome").$type<Outcome>(),

    // Onboarding
    linkToken: text("link_token").unique(),

    // Deliverable bundle — hash/manifest set on upload; submittedAt on confirm.
    deliverableHash: text("deliverable_hash"), // sha256(manifest), on-chain anchor
    deliverableRoot: text("deliverable_root"), // Merkle root (R_plain)
    deliverableStorageKey: text("deliverable_storage_key"),
    deliverableManifest: jsonb("deliverable_manifest").$type<Manifest>(),
    deliverableSubmittedAt: timestamp("deliverable_submitted_at", {
      withTimezone: true,
    }),

    // Verdict note (manual/admin context in the MVP)
    verdictNote: text("verdict_note"),

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
