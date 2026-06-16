/**
 * Deliverable encryption — multi-recipient envelope via `age`.
 *
 * Pure & isomorphic (browser + Node): the committer's browser encrypts the
 * bundle to the configured moderator recipients; a moderator service decrypts
 * with its identity. age handles the envelope (one payload key, wrapped to each
 * recipient) — so adding moderators is just adding recipients. We never
 * hand-roll crypto. See docs/deliverable-mechanism.md.
 */
import {
  Decrypter,
  Encrypter,
  generateIdentity,
  identityToRecipient,
} from "age-encryption";

export interface ModerationKeypair {
  /** age identity ("AGE-SECRET-KEY-1…") — secret; a moderator service holds it. */
  identity: string;
  /** age recipient ("age1…") — public; published so committers can encrypt. */
  recipient: string;
}

/** Generate a fresh moderation age keypair (identity + recipient). */
export async function generateModerationKeypair(): Promise<ModerationKeypair> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

/**
 * Multi-recipient envelope encryption. The payload is encrypted once; the file
 * key is wrapped to each recipient, so ANY one of them can decrypt.
 */
export async function encryptToRecipients(
  data: Uint8Array,
  recipients: string[]
): Promise<Uint8Array> {
  if (recipients.length === 0) {
    throw new Error("no moderation recipients configured");
  }
  const e = new Encrypter();
  for (const r of recipients) e.addRecipient(r);
  return e.encrypt(data);
}

/** Decrypt with a moderator's identity. Throws if this identity isn't a recipient. */
export async function decryptWithIdentity(
  ciphertext: Uint8Array,
  identity: string
): Promise<Uint8Array> {
  const d = new Decrypter();
  d.addIdentity(identity);
  return d.decrypt(ciphertext);
}
