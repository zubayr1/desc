/**
 * Today's work source: our own database, the contracts awaiting a verdict that
 * were assigned to the calling moderator.
 *
 * Scoped by moderator because assignment is real now: the escrow binds one
 * moderator at creation and rejects a verdict from any other. Claiming another
 * moderator's contract would only fail at `record_verdict` and get marked
 * failed — so each watcher sees exactly its own queue. Reading our database
 * directly is still the V1 shortcut the V2 queue endpoint replaces.
 */
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { PublicKey } from "@solana/web3.js";
import { db } from "../../db/client";
import { contracts } from "../../db/schema";
import type { WorkItem, WorkSource } from "./source";

/**
 * How long a claim is honoured before another worker may take it.
 *
 * A worker that crashes mid-judgment leaves `in_progress` behind with nobody
 * working on it. Without an expiry that contract is stranded forever; with one
 * it simply gets picked up again. Long enough that a slow judgment is not
 * stolen from a worker that is still going.
 */
const LEASE_MS = Number(process.env.MOD_CLAIM_LEASE_MS ?? 10 * 60_000);

export function dbWorkSource(): WorkSource {
  return {
    name: "local-db (contracts assigned to this moderator)",

    async claim(moderator: PublicKey): Promise<WorkItem[]> {
      const leaseCutoff = new Date(Date.now() - LEASE_MS);

      // ONE statement: select and claim together. Splitting this into a read
      // followed by a write would let two workers read the same row before
      // either wrote, and both would judge it.
      return db
        .update(contracts)
        .set({
          moderationState: "in_progress",
          moderationStartedAt: new Date(),
          moderationError: null,
          moderationAttempts: sql`${contracts.moderationAttempts} + 1`,
        })
        .where(
          and(
            // Delivered, and the chain has recorded no verdict yet.
            eq(contracts.status, "submitted"),
            isNull(contracts.outcome),
            // Nothing to judge until the ciphertext is actually uploaded.
            isNotNull(contracts.deliverableStorageKey),
            // Only this moderator's work. Rows created before assignment was
            // stored have no moderator and are left alone.
            eq(contracts.moderator, moderator.toBase58()),
            or(
              // Never picked up.
              isNull(contracts.moderationState),
              // Or claimed by a worker that has since gone quiet.
              and(
                eq(contracts.moderationState, "in_progress"),
                lt(contracts.moderationStartedAt, leaseCutoff)
              )
            )
            // `done` and `failed` match neither branch, so neither is re-judged.
          )
        )
        .returning({
          contractId: contracts.id,
          escrowAddress: contracts.escrowAddress,
          title: contracts.title,
          attempts: contracts.moderationAttempts,
        });
    },

    async release(contractId: string): Promise<void> {
      // "done", NOT null. Clearing the state made the row instantly claimable
      // again: the chain had the verdict, but our cached `outcome` stayed null
      // until the reconciler caught up ~30s later, so the next tick re-judged a
      // contract that was already settled — paying for the inference twice, and
      // then recording a failure because `submit_verdict` rejects a duplicate.
      await db
        .update(contracts)
        .set({ moderationState: "done", moderationError: null })
        .where(eq(contracts.id, contractId));
    },

    async fail(contractId: string, error: string): Promise<void> {
      await db
        .update(contracts)
        .set({ moderationState: "failed", moderationError: error.slice(0, 500) })
        .where(eq(contracts.id, contractId));
    },
  };
}
