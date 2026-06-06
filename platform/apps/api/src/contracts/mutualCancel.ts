import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { readEscrow } from "../solana/program";
import { buildMutualCancel } from "../solana/instructions/mutualCancel";
import { submitSignedTx } from "../solana/rpc";
import { toContract } from "./mapper";
import { getRow } from "./repo";

/** Build the unsigned `mutual_cancel` tx (both parties sign it). Valid from an
 *  active or submitted escrow. Committer is read from chain. */
export async function prepareMutualCancel(
  id: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRow(id);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  if (oc.status !== "active" && oc.status !== "submitted") {
    throw Object.assign(
      new Error(
        `cannot mutual-cancel: escrow is ${oc.status} (needs active or submitted)`
      ),
      { statusCode: 409 }
    );
  }
  if (!oc.committer) {
    throw Object.assign(new Error("no committer bound"), { statusCode: 409 });
  }

  const unsignedTx = await buildMutualCancel({
    initiator: new PublicKey(row.initiator),
    committer: new PublicKey(oc.committer),
    escrow: new PublicKey(row.escrowAddress),
    vault: new PublicKey(row.vaultAddress),
  });
  return { id: row.id, unsignedTx };
}

/** Submit the doubly-signed `mutual_cancel` tx; full deposit returns to the
 *  initiator and the escrow is refunded. */
export async function submitMutualCancel(
  id: string,
  signedTx: string
): Promise<Contract> {
  const row = await getRow(id);
  await submitSignedTx(signedTx);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));
  const [updated] = await db
    .update(contracts)
    .set({ updatedAt: new Date() })
    .where(eq(contracts.id, id))
    .returning();
  return toContract(updated, oc);
}
