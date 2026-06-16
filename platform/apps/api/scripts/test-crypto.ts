/**
 * Round-trip + multi-recipient checks for the deliverable encryption core.
 * Run: `pnpm --filter api test:crypto`
 */
import assert from "node:assert/strict";
import {
  generateModerationKeypair,
  encryptToRecipients,
  decryptWithIdentity,
  buildBundle,
  type BundleBlob,
} from "@repo/shared";

const enc = new TextEncoder();
const dec = new TextDecoder();

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log("  ✓", name);
    passed++;
  } catch (e) {
    console.error("  ✗", name, "\n     ", (e as Error).message);
    process.exitCode = 1;
  }
}

const modA = await generateModerationKeypair();
const modB = await generateModerationKeypair();
const modC = await generateModerationKeypair(); // not a recipient
const plain = enc.encode("the secret deliverable bytes 🔐");

// envelope encrypt to A and B
const ct = await encryptToRecipients(plain, [modA.recipient, modB.recipient]);

await check("ciphertext differs from plaintext", async () => {
  assert.notDeepEqual([...ct], [...plain]);
});

await check("recipient A can decrypt", async () => {
  assert.equal(dec.decode(await decryptWithIdentity(ct, modA.identity)), "the secret deliverable bytes 🔐");
});

await check("recipient B can decrypt (multi-recipient envelope)", async () => {
  assert.equal(dec.decode(await decryptWithIdentity(ct, modB.identity)), "the secret deliverable bytes 🔐");
});

await check("non-recipient C cannot decrypt", async () => {
  await assert.rejects(() => decryptWithIdentity(ct, modC.identity));
});

await check("encrypting with no recipients throws", async () => {
  await assert.rejects(() => encryptToRecipients(plain, []));
});

await check("keypair shapes look like age strings", async () => {
  assert.match(modA.identity, /^AGE-SECRET-KEY-1/i);
  assert.match(modA.recipient, /^age1/);
});

// The full deliverable chain: bundle → encrypt → decrypt → re-verify the hash.
await check("pack → encrypt → decrypt → re-verify round-trips", async () => {
  const inputs = [
    { path: "src/b.txt", content: enc.encode("world") },
    { path: "a.txt", content: enc.encode("hello") },
  ];
  const built = buildBundle(inputs, { withBlob: true });
  assert.ok(built.ok && built.blob, "bundle should build with a blob");

  const ct = await encryptToRecipients(built.blob!, [modA.recipient]);
  const blob = JSON.parse(dec.decode(await decryptWithIdentity(ct, modA.identity))) as BundleBlob;

  const reInputs = blob.files.map((f) => ({
    path: f.path,
    content: new Uint8Array(Buffer.from(f.contentBase64, "base64")),
  }));
  const salt = new Uint8Array(Buffer.from(blob.manifest.salt, "hex"));
  const verify = buildBundle(reInputs, { salt });

  assert.equal(verify.deliverableHash, built.deliverableHash, "hash must match after round-trip");
  assert.equal(verify.root, blob.manifest.root, "root must match the manifest");
});

console.log(`\n${passed} checks passed`);
