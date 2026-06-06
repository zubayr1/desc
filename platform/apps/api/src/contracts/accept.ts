import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { readEscrow } from "../solana/program";
import { buildAccept } from "../solana/instructions/accept";
import { submitSignedTx } from "../solana/rpc";
import { toContract } from "./mapper";
import { getRowByLink } from "./repo";

/** Build the unsigned `accept` tx for a committer (resolved via link token). */
export async function prepareAccept(
  token: string,
  committer: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRowByLink(token);
  const unsignedTx = await buildAccept({
    committer: new PublicKey(committer),
    escrow: new PublicKey(row.escrowAddress),
  });
  return { id: row.id, unsignedTx };
}

/** Submit the signed `accept` tx; the escrow goes funded → active. The
 *  committer is recorded on-chain, so we just bump the row and re-read. */
export async function submitAccept(
  token: string,
  signedTx: string
): Promise<Contract> {
  const row = await getRowByLink(token);
  await submitSignedTx(signedTx);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));
  const [updated] = await db
    .update(contracts)
    .set({ updatedAt: new Date() })
    .where(eq(contracts.id, row.id))
    .returning();
  return toContract(updated, oc);
}
