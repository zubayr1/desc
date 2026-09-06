/**
 * Today's work source: our own database, every contract awaiting a verdict.
 *
 * Correct only while we run the single moderator ourselves. It deliberately
 * IGNORES the moderator argument — there is no assignment yet, so every mod
 * would see every contract. That is exactly the shortcut the V2 queue endpoint
 * removes, and the reason this lives behind `WorkSource` rather than inline in
 * the watcher.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { PublicKey } from "@solana/web3.js";
import { db } from "../../db/client";
import { contracts } from "../../db/schema";
import type { WorkItem, WorkSource } from "./source";

export function dbWorkSource(): WorkSource {
  return {
    name: "local-db (all submitted contracts)",

    async pending(moderator: PublicKey): Promise<WorkItem[]> {
      void moderator; // no per-mod assignment exists yet — see the file comment

      const rows = await db
        .select({
          contractId: contracts.id,
          escrowAddress: contracts.escrowAddress,
          title: contracts.title,
        })
        .from(contracts)
        .where(
          and(
            // Delivered, and the chain has recorded no verdict yet.
            eq(contracts.status, "submitted"),
            isNull(contracts.outcome),
            // Nothing to judge until the ciphertext is actually uploaded.
            isNotNull(contracts.deliverableStorageKey)
          )
        );

      return rows;
    },
  };
}
