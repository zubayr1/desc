import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { readEscrow } from "../solana/program";
import { toContract } from "./mapper";
import { getRow } from "./repo";

/** Merged read: DB metadata + live chain state. Returns null if the escrow
 *  isn't on-chain yet (created but not funded). */
export async function getContract(id: string): Promise<Contract | null> {
  const row = await getRow(id);
  try {
    const oc = await readEscrow(new PublicKey(row.escrowAddress));
    return toContract(row, oc);
  } catch {
    return null;
  }
}
