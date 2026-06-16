import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract, DeliverableUploadRequest } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { readEscrow, type OnChainEscrow } from "../solana/program";
import { buildSubmitDeliverable } from "../solana/instructions/submitDeliverable";
import { submitSignedTx } from "../solana/rpc";
import * as storage from "../storage";
import { toContract } from "./mapper";
import { getRowByLink, cacheFields } from "./repo";

/** Friendly early-fail (the program is the real guard): must be active + bound. */
async function activeGuard(escrowAddress: string): Promise<OnChainEscrow> {
  const oc = await readEscrow(new PublicKey(escrowAddress));
  if (oc.status !== "active") {
    throw Object.assign(new Error(`cannot submit: escrow is ${oc.status}, not active`), {
      statusCode: 409,
    });
  }
  if (!oc.committer) {
    throw Object.assign(new Error("no committer bound"), { statusCode: 409 });
  }
  return oc;
}

/**
 * Store the committer's **encrypted** deliverable bundle. The server is BLIND —
 * the ciphertext is sealed to the moderators, so we never validate or read it
 * here (the moderator does that at verify time, after decrypting). We store the
 * ciphertext by its hash and record the on-chain anchors. No chain write yet.
 */
export async function uploadDeliverable(
  token: string,
  req: DeliverableUploadRequest
): Promise<{ ok: true; deliverableHash: string }> {
  const row = await getRowByLink(token);
  await activeGuard(row.escrowAddress);

  const storageKey = `${req.deliverableHash}.age`;
  await storage.put(storageKey, new Uint8Array(Buffer.from(req.ciphertext, "base64")));

  await db
    .update(contracts)
    .set({
      deliverableHash: req.deliverableHash,
      deliverableRoot: req.root,
      deliverableStorageKey: storageKey,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, row.id));

  return { ok: true, deliverableHash: req.deliverableHash };
}

/** Build the unsigned `submit` tx from the uploaded bundle's hash. Refuses if
 *  nothing's been uploaded/stored — no orphan hashes on-chain. */
export async function prepareDeliverable(
  token: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRowByLink(token);
  const oc = await activeGuard(row.escrowAddress);

  if (!row.deliverableHash || !row.deliverableStorageKey) {
    throw Object.assign(new Error("upload a deliverable before submitting"), { statusCode: 409 });
  }
  if (!(await storage.exists(row.deliverableStorageKey))) {
    throw Object.assign(new Error("deliverable bundle missing from storage"), { statusCode: 409 });
  }

  const unsignedTx = await buildSubmitDeliverable({
    committer: new PublicKey(oc.committer!),
    escrow: new PublicKey(row.escrowAddress),
    deliverableHashBytes: Array.from(Buffer.from(row.deliverableHash, "hex")),
  });
  return { id: row.id, unsignedTx };
}

/** Submit the signed `submit` tx; escrow goes active → submitted. */
export async function submitDeliverable(token: string, signedTx: string): Promise<Contract> {
  const row = await getRowByLink(token);
  await submitSignedTx(signedTx);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));
  const [updated] = await db
    .update(contracts)
    .set({ deliverableSubmittedAt: new Date(), ...cacheFields(oc) })
    .where(eq(contracts.id, row.id))
    .returning();
  return toContract(updated, oc);
}
