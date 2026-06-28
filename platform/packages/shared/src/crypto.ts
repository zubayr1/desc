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
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";

export interface AgeKeypair {
  /** age identity ("AGE-SECRET-KEY-1…") — secret; never leaves the holder. */
  identity: string;
  /** age recipient ("age1…") — public; published so others can encrypt to it. */
  recipient: string;
}

/** @deprecated alias — use {@link AgeKeypair}. */
export type ModerationKeypair = AgeKeypair;

/** Generate a fresh age keypair (identity + recipient). */
export async function generateModerationKeypair(): Promise<AgeKeypair> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

/**
 * Fixed, domain-separated message the **initiator** signs with their wallet to
 * derive their deliverable-encryption key. ed25519 signing is deterministic, so
 * the same wallet always re-derives the same key — non-custodial, nothing stored.
 * Bump the version suffix only if the derivation scheme changes.
 */
export const DELIVERABLE_KEY_MESSAGE = "desc.deliverable-key.v1";

/**
 * Derive a deterministic age keypair from a 32-byte seed. age stores the raw
 * X25519 scalar as the secret, so any 32 bytes is a valid identity — we just
 * bech32-encode it and let `age` compute the recipient (no hand-rolled crypto).
 */
export async function deriveIdentityFromSeed(seed: Uint8Array): Promise<AgeKeypair> {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const identity = bech32.encodeFromBytes("AGE-SECRET-KEY-", seed).toUpperCase();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

/**
 * Derive the initiator's deliverable keypair from their wallet signature over
 * {@link DELIVERABLE_KEY_MESSAGE} (hashed to a uniform seed). The recipient is
 * stored on the contract so committers seal to it; the identity is re-derived on
 * demand to decrypt — it is never stored or transmitted.
 */
export async function deriveIdentityFromSignature(
  signature: Uint8Array
): Promise<AgeKeypair> {
  return deriveIdentityFromSeed(sha256(signature));
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
