import { and, count, desc, eq, isNotNull } from "drizzle-orm";
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
function listFilter(opts: { initiator?: string; status?: ContractStatus }) {
  const conds = [isNotNull(contracts.status)];
  if (opts.initiator) conds.push(eq(contracts.initiator, opts.initiator));
  if (opts.status) conds.push(eq(contracts.status, opts.status));
  return and(...conds);
}

/** Every matching row — the reconciler's view. The list route pages instead. */
export async function getRows(opts: {
  initiator?: string;
  status?: ContractStatus;
}): Promise<ContractRow[]> {
  return db
    .select()
    .from(contracts)
    .where(listFilter(opts))
    .orderBy(desc(contracts.createdAt));
}

/** One page of matching rows, newest first, plus the total across all pages. */
export async function getRowsPage(
  opts: { initiator?: string; status?: ContractStatus },
  page: { limit: number; offset: number }
): Promise<{ rows: ContractRow[]; total: number }> {
  const where = listFilter(opts);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select()
      .from(contracts)
      .where(where)
      // id breaks ties so a page boundary never repeats or skips a row
      .orderBy(desc(contracts.createdAt), desc(contracts.id))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: count() }).from(contracts).where(where),
  ]);
  return { rows, total: Number(n) };
}

/** Write-through cache fields, set on every flow after reading the escrow. */
export const cacheFields = (oc: OnChainEscrow) => ({
  status: oc.status,
  committer: oc.committer,
  outcome: oc.outcome,
  updatedAt: new Date(),
});

/** Reconcile one row's cached fields from a fresh on-chain read (reconciler). */
export async function writeCache(id: string, oc: OnChainEscrow): Promise<void> {
  await db.update(contracts).set(cacheFields(oc)).where(eq(contracts.id, id));
}
