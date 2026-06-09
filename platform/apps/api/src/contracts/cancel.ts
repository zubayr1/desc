import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { readEscrow } from "../solana/program";
import { buildCancel } from "../solana/instructions/cancel";
import { submitSignedTx } from "../solana/rpc";
import { toContract } from "./mapper";
import { getRow, cacheFields } from "./repo";

/** Build the unsigned `cancel` tx for an initiator to sign. */
export async function prepareCancel(
  id: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRow(id);
  const unsignedTx = await buildCancel({
    initiator: new PublicKey(row.initiator),
    escrow: new PublicKey(row.escrowAddress),
    vault: new PublicKey(row.vaultAddress),
  });
  return { id: row.id, unsignedTx };
}

/** Submit the signed `cancel` tx; the escrow is refunded + marked cancelled. */
export async function submitCancel(
  id: string,
  signedTx: string
): Promise<Contract> {
  const row = await getRow(id);
  await submitSignedTx(signedTx);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));
  const [updated] = await db
    .update(contracts)
    .set(cacheFields(oc))
    .where(eq(contracts.id, id))
    .returning();
  return toContract(updated, oc);
}
