import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { readEscrow } from "../solana/program";
import { buildRefund } from "../solana/instructions/refund";
import { submitSignedTx } from "../solana/rpc";
import { toContract } from "./mapper";
import { getRow, cacheFields } from "./repo";

/** Build the unsigned `refund` tx for the initiator. Valid on a ghost-timeout
 *  (active + past deadline, no submission) or a Fail verdict. */
export async function prepareRefund(
  id: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRow(id);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  const now = Math.floor(Date.now() / 1000);
  const ghosted = oc.status === "active" && now > oc.deadline;
  const failed = oc.status === "submitted" && oc.outcome === "fail";
  if (!ghosted && !failed) {
    throw Object.assign(
      new Error(
        "cannot refund: needs a ghost timeout (active, past deadline) or a Fail verdict"
      ),
      { statusCode: 409 }
    );
  }

  const unsignedTx = await buildRefund({
    initiator: new PublicKey(row.initiator),
    escrow: new PublicKey(row.escrowAddress),
    vault: new PublicKey(row.vaultAddress),
  });
  return { id: row.id, unsignedTx };
}

/** Submit the signed `refund` tx; the full deposit returns to the initiator. */
export async function submitRefund(
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
