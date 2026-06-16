/**
 * Moderator-side decrypt + verify (dev tool, custodial-free: the key is loaded
 * from a file YOU control, not a shared .env).
 *
 *   pnpm --filter api deliverable-decrypt <contractId> <identityFile> [outDir]
 *
 * Reads the contract's stored ciphertext, decrypts it with the moderator's age
 * identity, recomputes the bundle, and checks the hash matches what's on-chain.
 * (Proves end-to-end sealing/decryption. The real moderator console will do this
 * in the mod's browser with a client-held key.)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import type { BundleBlob, InputFile } from "@repo/shared";
import { buildBundle, decryptWithIdentity } from "@repo/shared";
import { db } from "../src/db/client";
import { contracts } from "../src/db/schema";
import * as storage from "../src/storage";

const [ref, identityPath, outDir] = process.argv.slice(2);
if (!ref || !identityPath) {
  console.error("usage: deliverable-decrypt <contractId|linkToken> <identityFile> [outDir]");
  process.exit(1);
}

// Accept either the contract uuid (/contracts/<uuid>) or the link token (/c/<token>).
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
const [row] = await db
  .select()
  .from(contracts)
  .where(isUuid ? eq(contracts.id, ref) : eq(contracts.linkToken, ref));
if (!row) {
  console.error("contract not found for:", ref);
  process.exit(1);
}
if (!row.deliverableStorageKey || !row.deliverableHash) {
  console.error("no deliverable uploaded for this contract");
  process.exit(1);
}

const identity = readFileSync(identityPath, "utf8").trim();
const ciphertext = await storage.get(row.deliverableStorageKey);

const plain = await decryptWithIdentity(ciphertext, identity);
const blob = JSON.parse(new TextDecoder().decode(plain)) as BundleBlob;

// Re-verify: rebuild from the decrypted files with the embedded salt, and confirm
// the recomputed hash equals the one anchored on-chain.
const inputs: InputFile[] = blob.files.map((f) => ({
  path: f.path,
  content: new Uint8Array(Buffer.from(f.contentBase64, "base64")),
}));
const salt = new Uint8Array(Buffer.from(blob.manifest.salt, "hex"));
const verify = buildBundle(inputs, { salt });

const hashOk = verify.deliverableHash === row.deliverableHash;
const rootOk = verify.root === blob.manifest.root;

console.log("\nDecrypted deliverable for contract", row.id);
console.log("  on-chain/db hash :", row.deliverableHash);
console.log("  recomputed hash  :", verify.deliverableHash, hashOk ? "✓ MATCH" : "✗ MISMATCH");
console.log("  root             :", verify.root, rootOk ? "✓ MATCH" : "✗ MISMATCH");
console.log("\n  files:");
for (const f of blob.files) console.log("    -", f.path);

if (outDir) {
  for (const f of blob.files) {
    const dest = join(outDir, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(f.contentBase64, "base64"));
  }
  console.log("\n  wrote decrypted files to", outDir);
}

process.exit(hashOk && rootOk ? 0 : 1);
