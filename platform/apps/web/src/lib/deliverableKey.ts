import {
  DELIVERABLE_KEY_MESSAGE,
  deriveIdentityFromSignature,
  type AgeKeypair,
} from "@repo/shared";

/**
 * Sign the fixed message with the connected wallet and derive the initiator's
 * deliverable `age` keypair. Deterministic (ed25519), so the same wallet always
 * re-derives the same key — nothing is stored. Used at create (to register the
 * recipient) and again on a Pass (to decrypt the verified bytes).
 */
export async function deriveDeliverableKey(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<AgeKeypair> {
  const signature = await signMessage(new TextEncoder().encode(DELIVERABLE_KEY_MESSAGE));
  return deriveIdentityFromSignature(signature);
}
