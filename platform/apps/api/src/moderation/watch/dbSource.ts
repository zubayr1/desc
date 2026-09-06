/**
 * Today's work source: our own database, every contract awaiting a verdict.
 *
 * Correct only while we run the single moderator ourselves. It deliberately
 * IGNORES the moderator argument — there is no assignment yet, so every mod
 * would see every contract. That is exactly the shortcut the V2 queue endpoint
 * removes, and the reason this lives behind `WorkSource` rather than inline in
 * the watcher.
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
    name: "local-db (all submitted contracts)",

    async claim(moderator: PublicKey): Promise<WorkItem[]> {
      void moderator; // no per-mod assignment exists yet — see the file comment

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
