import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { readEscrow } from "../solana/program";
import { buildSubmitDeliverable } from "../solana/instructions/submitDeliverable";
import { submitSignedTx } from "../solana/rpc";
import { toContract } from "./mapper";
import { getRowByLink } from "./repo";

/**
 * Build the unsigned `submit` tx. The committer is read from chain (the bound
 * `escrow.committer`) — not trusted from the client. The payload is hashed
 * (sha256) and that hash goes on-chain; we stash payload + hash now and flip
 * `submittedAt` once the tx confirms.
 */
export async function prepareDeliverable(
  token: string,
  payload: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRowByLink(token);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  // Friendly early-fail (UX only — the program is the real guard).
  if (oc.status !== "active") {
    throw Object.assign(
      new Error(`cannot submit: escrow is ${oc.status}, not active`),
      { statusCode: 409 }
    );
  }
  if (!oc.committer) {
    throw Object.assign(new Error("no committer bound"), { statusCode: 409 });
  }

  const hashBuf = createHash("sha256").update(payload).digest();
  const unsignedTx = await buildSubmitDeliverable({
    committer: new PublicKey(oc.committer),
    escrow: new PublicKey(row.escrowAddress),
    deliverableHashBytes: Array.from(hashBuf),
  });

  await db
    .update(contracts)
    .set({
      deliverablePayload: payload,
      deliverableHash: hashBuf.toString("hex"),
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, row.id));

  return { id: row.id, unsignedTx };
}

/** Submit the signed `submit` tx; escrow goes active → submitted. */
export async function submitDeliverable(
  token: string,
  signedTx: string
): Promise<Contract> {
  const row = await getRowByLink(token);
  await submitSignedTx(signedTx);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));
  const [updated] = await db
    .update(contracts)
    .set({ deliverableSubmittedAt: new Date(), updatedAt: new Date() })
    .where(eq(contracts.id, row.id))
    .returning();
  return toContract(updated, oc);
}
