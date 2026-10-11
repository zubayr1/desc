/**
 * Each moderator's last few results, for the form guide. Read from the cached
 * panel votes on finished contracts — the chain keeps totals, not history.
 */
import { and, desc, inArray, isNotNull, sql } from "drizzle-orm";
import type { RecentResult } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { classifySeat } from "./seatResult";

export const RECENT_LIMIT = 5;
const SCAN = 500;
const TTL_MS = 60_000;

let cache: { at: number; byWallet: Map<string, RecentResult[]> } | undefined;

/** Moderator wallet → its last results, newest first. */
export async function recentResults(): Promise<Map<string, RecentResult[]>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.byWallet;

  const rows = await db
    .select({ panel: contracts.panel, outcome: contracts.outcome })
    .from(contracts)
    .where(
      and(
        inArray(contracts.status, ["settled", "refunded"]),
        isNotNull(contracts.outcome),
        sql`jsonb_array_length(${contracts.panel}) > 0`
      )
    )
    .orderBy(desc(contracts.updatedAt))
    .limit(SCAN);

  const byWallet = new Map<string, RecentResult[]>();
  for (const row of rows) {
    for (const seat of row.panel) {
      const list = byWallet.get(seat.wallet) ?? [];
      if (list.length >= RECENT_LIMIT) continue;
      const result = classifySeat(seat, row.outcome, row.panel.length);
      if (!result) continue;
      list.push(result);
      byWallet.set(seat.wallet, list);
    }
  }
  cache = { at: Date.now(), byWallet };
  return byWallet;
}
