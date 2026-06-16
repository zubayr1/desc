/**
 * Round-trip + multi-recipient checks for the deliverable encryption core.
 * Run: `pnpm --filter api test:crypto`
 */
import assert from "node:assert/strict";
import {
  generateModerationKeypair,
  encryptToRecipients,
  decryptWithIdentity,
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

console.log(`\n${passed} checks passed`);
