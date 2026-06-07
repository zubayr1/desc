import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { ContractStatus } from "@repo/shared";
import { db } from "../db/client";
import { contracts, type ContractRow } from "../db/schema";
import type { OnChainEscrow } from "../solana/program";

/** Fetch a contract row by id, or throw a 404-tagged error. */
export async function getRow(id: string): Promise<ContractRow> {
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!row) throw Object.assign(new Error("contract not found"), { statusCode: 404 });
  return row;
}

/** Resolve a contract row by its shareable link token, or throw 404. */
export async function getRowByLink(token: string): Promise<ContractRow> {
  const [row] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.linkToken, token));
  if (!row) throw Object.assign(new Error("link not found"), { statusCode: 404 });
  return row;
}

/** Funded+ contract rows (cached `status` is set), filtered + newest first. */
export async function getRows(opts: {
  initiator?: string;
  status?: ContractStatus;
}): Promise<ContractRow[]> {
  const conds = [isNotNull(contracts.status)];
  if (opts.initiator) conds.push(eq(contracts.initiator, opts.initiator));
  if (opts.status) conds.push(eq(contracts.status, opts.status));
  return db
    .select()
    .from(contracts)
    .where(and(...conds))
    .orderBy(desc(contracts.createdAt));
}

/** Write-through cache fields, set on every flow after reading the escrow. */
export const cacheFields = (oc: OnChainEscrow) => ({
  status: oc.status,
  committer: oc.committer,
  outcome: oc.outcome,
  updatedAt: new Date(),
});
