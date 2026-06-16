import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract, DeliverableUpload, InputFile, UploadFile } from "@repo/shared";
import { buildBundle } from "@repo/shared";
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
 * Validate + bundle the uploaded files (the API is the verification authority),
 * store the content-addressed blob, and stash the hash/manifest. No chain write
 * here — that's `prepare`/`submit`. Storing first means the on-chain hash always
 * points at a retrievable bundle.
 */
export async function uploadDeliverable(
  token: string,
  files: UploadFile[]
): Promise<DeliverableUpload> {
  const row = await getRowByLink(token);
  await activeGuard(row.escrowAddress);

  const inputs: InputFile[] = files.map((f) => ({
    path: f.path,
    content: new Uint8Array(Buffer.from(f.contentBase64, "base64")),
  }));
  const bundle = buildBundle(inputs);

  if (!bundle.ok || !bundle.manifest || !bundle.deliverableHash) {
    return {
      ok: false,
      deliverableHash: null,
      root: null,
      fileCount: 0,
      totalSize: bundle.totalSize,
      files: [],
      rejected: bundle.rejected,
    };
  }

  // Store the bundle (manifest + file contents) keyed by the deliverable hash.
  const storageKey = `${bundle.deliverableHash}.json`;
  const blob = JSON.stringify({ manifest: bundle.manifest, files });
  await storage.put(storageKey, new TextEncoder().encode(blob));

  await db
    .update(contracts)
    .set({
      deliverableHash: bundle.deliverableHash,
      deliverableRoot: bundle.root,
      deliverableStorageKey: storageKey,
      deliverableManifest: bundle.manifest,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, row.id));

  return {
    ok: true,
    deliverableHash: bundle.deliverableHash,
    root: bundle.root,
    fileCount: bundle.accepted.length,
    totalSize: bundle.totalSize,
    files: bundle.accepted.map((f) => ({ path: f.path, size: f.size })),
    rejected: bundle.rejected,
  };
}

/** Build the unsigned `submit` tx from the already-uploaded bundle's hash.
 *  Refuses if nothing's been uploaded/stored — no orphan hashes on-chain. */
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
