import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { PublicKey } from "@solana/web3.js";
import { db } from "../../db/client";
import { contracts } from "../../db/schema";
import type { AcceptanceCriterion } from "../runCheck";
import { LEASE_MS } from "../watch/dbSource";

export interface Contested {
  id: string;
  title: string;
  escrowAddress: string;
  storageKey: string;
  criteria: AcceptanceCriterion[];
}

/** Every submitted contract with a panel and a delivery; the chain decides which need a tiebreak. */
export async function submittedWithPanel(): Promise<Contested[]> {
  const rows = await db
    .select({
      id: contracts.id,
      title: contracts.title,
      escrowAddress: contracts.escrowAddress,
      storageKey: contracts.deliverableStorageKey,
      criteria: contracts.acceptanceCriteria,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.status, "submitted"),
        isNotNull(contracts.deliverableStorageKey),
        sql`jsonb_array_length(${contracts.panel}) > 0`
      )
    );
  return rows.map((r) => ({ ...r, storageKey: r.storageKey!, criteria: r.criteria ?? [] }));
}

const cutoff = () => new Date(Date.now() - LEASE_MS).toISOString();

/** Wallets that already took this contract: finished, failed, or still inside their lease. */
export async function triedBy(contractId: string): Promise<Set<string>> {
  const r = await db.execute(sql`
    SELECT moderator FROM moderation_claims
    WHERE contract_id = ${contractId}
      AND (state <> 'in_progress' OR started_at >= ${cutoff()}::timestamptz)
  `);
  return new Set(r.rows.map((x) => String(x.moderator)));
}

/** Atomic, like the panel claim: only a fresh row or an expired lease is taken. */
export async function claimTiebreak(contractId: string, tiebreaker: PublicKey): Promise<boolean> {
  const r = await db.execute(sql`
    INSERT INTO moderation_claims (contract_id, moderator, state, attempts, started_at, updated_at)
    VALUES (${contractId}, ${tiebreaker.toBase58()}, 'in_progress', 1, now(), now())
    ON CONFLICT (contract_id, moderator) DO UPDATE
      SET state = 'in_progress', attempts = moderation_claims.attempts + 1,
          error = NULL, started_at = now(), updated_at = now()
      WHERE moderation_claims.state = 'in_progress'
        AND moderation_claims.started_at < ${cutoff()}::timestamptz
    RETURNING contract_id
  `);
  return r.rows.length > 0;
}
