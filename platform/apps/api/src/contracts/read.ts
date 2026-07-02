import { PublicKey } from "@solana/web3.js";
import type { Contract, ContractStatus } from "@repo/shared";
import type { ContractRow } from "../db/schema";
import { readEscrow, readEscrows, type OnChainEscrow } from "../solana/program";
import { toContract } from "./mapper";
import { getRow, getRowByLink, getRows, writeCache } from "./repo";

/** Final states — never change, so never re-read them. */
const TERMINAL: ReadonlySet<ContractStatus> = new Set([
  "settled",
  "refunded",
  "cancelled",
]);

/** Detail read: live chain state. Null if the escrow isn't on-chain yet. */
async function merge(row: ContractRow): Promise<Contract | null> {
  try {
    const oc = await readEscrow(new PublicKey(row.escrowAddress));
    return toContract(row, oc);
  } catch {
    return null;
  }
}

export async function getContract(id: string): Promise<Contract | null> {
  return merge(await getRow(id));
}

export async function getContractByLink(
  token: string
): Promise<Contract | null> {
  return merge(await getRowByLink(token));
}

/**
 * List read with reconcile-on-read: refresh the **non-terminal** rows from chain
 * in one batched call so the list reflects direct-to-chain txns and `mod-run`
 * verdicts that bypass the write-through cache, write back any drift, and return
 * the fresh state. Fail-safe: any RPC error falls back to the cached columns, so
 * the list degrades but never errors.
 */
export async function listContracts(opts: {
  initiator?: string;
  status?: ContractStatus;
}): Promise<Contract[]> {
  const rows = await getRows(opts);
  const fresh = new Map<string, OnChainEscrow>();

  try {
    const inflight = rows.filter((r) => !TERMINAL.has(r.status as ContractStatus));
    if (inflight.length) {
      const live = await readEscrows(
        inflight.map((r) => new PublicKey(r.escrowAddress))
      );
      const writes: Promise<void>[] = [];
      for (const r of inflight) {
        const oc = live.get(r.escrowAddress);
        if (!oc) continue; // not on-chain (yet) — keep cached
        fresh.set(r.id, oc);
        if (
          oc.status !== r.status ||
          oc.committer !== r.committer ||
          oc.outcome !== r.outcome
        ) {
          writes.push(writeCache(r.id, oc));
        }
      }
      if (writes.length) await Promise.all(writes);
    }
  } catch {
    // RPC unreachable — fall through to the cached state below.
  }

  return rows.map((row) =>
    toContract(
      row,
      fresh.get(row.id) ?? {
        status: row.status as ContractStatus,
        committer: row.committer,
        outcome: row.outcome,
      }
    )
  );
}
