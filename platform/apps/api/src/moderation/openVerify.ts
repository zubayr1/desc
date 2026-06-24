import type { BundleBlob, InputFile } from "@repo/shared";
import { buildBundle, decryptWithIdentity } from "@repo/shared";

export interface OpenedDeliverable {
  /** The decrypted files (the moderator's input for the check). */
  files: InputFile[];
  /** Recomputed sha256(manifest), hex — equals the on-chain anchor. */
  deliverableHash: string;
  /** Recomputed Merkle root, hex. */
  root: string;
}

/**
 * Step 5 — open + verify. Decrypt the sealed bundle with the moderator's own age
 * identity, rebuild it deterministically with the embedded salt, and confirm the
 * recomputed deliverable hash equals the one anchored **on-chain**.
 *
 * Throws on any mismatch — a moderator must never judge bytes that don't match the
 * committed hash (that's the whole point of the content-addressed commitment).
 */
export async function openAndVerify(opts: {
  ciphertext: Uint8Array;
  identity: string;
  /** The on-chain `deliverable_hash` (hex) this bundle must match. */
  expectedHash: string;
}): Promise<OpenedDeliverable> {
  const plain = await decryptWithIdentity(opts.ciphertext, opts.identity);
  const blob = JSON.parse(new TextDecoder().decode(plain)) as BundleBlob;

  const files: InputFile[] = blob.files.map((f) => ({
    path: f.path,
    content: new Uint8Array(Buffer.from(f.contentBase64, "base64")),
  }));
  const salt = new Uint8Array(Buffer.from(blob.manifest.salt, "hex"));
  const rebuilt = buildBundle(files, { salt });

  if (rebuilt.deliverableHash !== opts.expectedHash) {
    throw new Error(
      "deliverable hash mismatch — sealed bytes do not match the on-chain commitment\n" +
        `  on-chain  : ${opts.expectedHash}\n` +
        `  recomputed: ${rebuilt.deliverableHash}`
    );
  }
  if (rebuilt.root !== blob.manifest.root) {
    throw new Error("merkle root mismatch inside the decrypted bundle");
  }

  return { files, deliverableHash: rebuilt.deliverableHash, root: rebuilt.root };
}
