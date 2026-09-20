/**
 * Today's work source: our own database, the contracts whose panel seats this
 * moderator holds and has not yet judged.
 *
 * Scoped by moderator because seats are real: the escrow's panel names who may
 * vote and `record_verdict` rejects anyone else. Claiming another moderator's
 * contract would only fail on-chain and get marked failed — so each watcher
 * sees exactly its own queue. Reading our database directly is still the V1
 * shortcut the V2 queue endpoint replaces.
 *
 * Claims live in `moderation_claims`, one row per (contract, moderator). Three
 * watchers on one contract therefore claim three separate rows and never
 * collide — which is the whole reason the old single column on `contracts` had
 * to go.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PublicKey } from "@solana/web3.js";
import { db } from "../../db/client";
import { moderationClaims } from "../../db/schema";
import type { WorkItem, WorkSource } from "./source";

/**
 * How long a claim is honoured before another worker may take it.
 *
 * A worker that crashes mid-judgment leaves `in_progress` behind with nobody
 * working on it. Without an expiry that seat is stranded forever; with one it
 * simply gets picked up again. Long enough that a slow judgment is not stolen
 * from a worker that is still going.
 */
const LEASE_MS = Number(process.env.MOD_CLAIM_LEASE_MS ?? 10 * 60_000);

export function dbWorkSource(): WorkSource {
  return {
    name: "local-db (this moderator's panel seats)",

    async claim(moderator: PublicKey): Promise<WorkItem[]> {
      const wallet = moderator.toBase58();
      const leaseCutoff = new Date(Date.now() - LEASE_MS).toISOString();
      // jsonb containment: does the contract's panel hold a seat for us?
      const seat = JSON.stringify([{ wallet }]);

      // ONE statement: select and claim together. A read followed by a write
      // would let two workers see the same seat unclaimed and both judge it.
      // `ON CONFLICT ... DO UPDATE ... WHERE` is what makes re-claiming an
      // expired lease atomic — a row that does not match the WHERE returns
      // nothing, so it is not handed out twice.
      const claimed = await db.execute(sql`
        WITH claimed AS (
          INSERT INTO moderation_claims
            (contract_id, moderator, state, attempts, started_at, updated_at)
          SELECT c.id, ${wallet}, 'in_progress', 1, now(), now()
          FROM contracts c
          WHERE c.status = 'submitted'
            -- The chain has recorded no verdict yet (cached; mod-run re-reads
            -- it on chain before spending anything).
            AND c.outcome IS NULL
            -- Nothing to judge until the ciphertext is actually uploaded.
            AND c.deliverable_storage_key IS NOT NULL
            -- A seat on this contract's panel. The legacy column covers rows
            -- created before the panel was stored.
            AND (c.panel @> ${seat}::jsonb OR c.moderator = ${wallet})
          ON CONFLICT (contract_id, moderator) DO UPDATE
            SET state = 'in_progress',
                attempts = moderation_claims.attempts + 1,
                error = NULL,
                started_at = now(),
                updated_at = now()
            -- Only a claim whose worker has gone quiet. done and failed match
            -- neither, so neither is re-judged.
            WHERE moderation_claims.state = 'in_progress'
              AND moderation_claims.started_at < ${leaseCutoff}::timestamptz
          RETURNING contract_id, attempts
        )
        SELECT cl.contract_id AS "contractId",
               cl.attempts    AS "attempts",
               c.escrow_address AS "escrowAddress",
               c.title          AS "title"
        FROM claimed cl
        JOIN contracts c ON c.id = cl.contract_id
      `);

      // Raw SQL comes back untyped, so the shape is asserted here rather than
      // trusted — the aliases above are what produce these keys.
      return claimed.rows.map((r) => ({
        contractId: String(r.contractId),
        escrowAddress: (r.escrowAddress as string | null) ?? null,
        title: (r.title as string | null) ?? null,
        attempts: Number(r.attempts),
      }));
    },

    async release(contractId: string, moderator: PublicKey): Promise<void> {
      // "done", NOT deleted. Dropping the row made the seat instantly claimable
      // again: the chain had the verdict, but our cached `outcome` stayed null
      // until the reconciler caught up ~30s later, so the next tick re-judged a
      // contract that was already settled — paying for the inference twice, and
      // then recording a failure because `submit_verdict` rejects a duplicate.
      await db
        .update(moderationClaims)
        .set({ state: "done", error: null, updatedAt: new Date() })
        .where(
          and(
            eq(moderationClaims.contractId, contractId),
            eq(moderationClaims.moderator, moderator.toBase58())
          )
        );
    },

    async fail(contractId: string, moderator: PublicKey, error: string): Promise<void> {
      await db
        .update(moderationClaims)
        .set({ state: "failed", error: error.slice(0, 500), updatedAt: new Date() })
        .where(
          and(
            eq(moderationClaims.contractId, contractId),
            eq(moderationClaims.moderator, moderator.toBase58())
          )
        );
    },
  };
}
