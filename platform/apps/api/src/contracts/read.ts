import { PublicKey } from "@solana/web3.js";
import type { Contract, ContractStatus } from "@repo/shared";
import type { ContractRow } from "../db/schema";
import { readEscrow } from "../solana/program";
import { toContract } from "./mapper";
import { getRow, getRowByLink, getRows } from "./repo";

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

/** List read: built from the cached columns — no per-row chain reads. */
export async function listContracts(opts: {
  initiator?: string;
  status?: ContractStatus;
}): Promise<Contract[]> {
  const rows = await getRows(opts);
  return rows.map((row) =>
    toContract(row, {
      status: row.status as ContractStatus,
      committer: row.committer,
      outcome: row.outcome,
    })
  );
}
