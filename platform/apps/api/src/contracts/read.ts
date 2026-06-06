import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import type { ContractRow } from "../db/schema";
import { readEscrow } from "../solana/program";
import { toContract } from "./mapper";
import { getRow, getRowByLink } from "./repo";

/** Merge a row with live chain state; null if the escrow isn't on-chain yet. */
async function merge(row: ContractRow): Promise<Contract | null> {
  try {
    const oc = await readEscrow(new PublicKey(row.escrowAddress));
    return toContract(row, oc);
  } catch {
    return null;
  }
}

/** Merged read by id: DB metadata + live chain state. */
export async function getContract(id: string): Promise<Contract | null> {
  return merge(await getRow(id));
}

/** Merged read by shareable link token (the committer's review view). */
export async function getContractByLink(
  token: string
): Promise<Contract | null> {
  return merge(await getRowByLink(token));
}
