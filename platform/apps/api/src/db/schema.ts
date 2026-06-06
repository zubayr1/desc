import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AcceptanceCriterion } from "@repo/shared";

/**
 * Off-chain contract metadata. The chain is the source of truth for status,
 * committer, amounts, and outcome — this table only holds what the chain can't.
 */
export const contracts = pgTable("contracts", {
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

  // Money (base units, stored as text mirrors for display)
  mint: text("mint").notNull(),
  amount: text("amount").notNull(),
  protocolFee: text("protocol_fee").notNull(),
  moderatorSurcharge: text("moderator_surcharge").notNull(),
  moderatorCount: integer("moderator_count").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),

  // Onboarding
  linkToken: text("link_token").unique(),

  // Deliverable (set on submit)
  deliverablePayload: text("deliverable_payload"),
  deliverableHash: text("deliverable_hash"),
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
});

export type ContractRow = typeof contracts.$inferSelect;
export type NewContractRow = typeof contracts.$inferInsert;
