import { connection } from "./program";

/**
 * How long to wait for a submitted transaction to confirm.
 *
 * A blockhash is valid for ~150 slots (roughly a minute), so a transaction that
 * has not landed by then never will. Waiting longer only delays telling the
 * user something they can act on.
 */
const CONFIRM_TIMEOUT_MS = 90_000;
const POLL_MS = 1_000;

/**
 * Send a wallet-signed (base64) transaction and wait for it to confirm.
 *
 * Confirmation polls the signature rather than using `confirmTransaction` with
 * a blockhash: the previous version fetched a FRESH blockhash to confirm
 * against, which is not the one the transaction was built with, so its expiry
 * check was watching an unrelated window and only worked by luck. The signature
 * is the thing we actually care about, and it does not drift.
 */
export async function submitSignedTx(signedTxB64: string): Promise<string> {
  const raw = Buffer.from(signedTxB64, "base64");
  const signature = await connection.sendRawTransaction(raw);

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  for (;;) {
    const { value } = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: false,
    });
    if (value?.err) {
      throw new Error(
        `Transaction ${signature} failed on-chain: ${JSON.stringify(value.err)}`
      );
    }
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
      return signature;
    }
    if (Date.now() > deadline) {
      // Its blockhash is long dead by now, so it cannot land later. Say so in
      // the words the error handler recognises, so the user is told to retry
      // rather than to check a balance that was never the problem.
      throw new Error(
        `Transaction ${signature} was not confirmed in ${CONFIRM_TIMEOUT_MS / 1000}s — blockhash not found or expired.`
      );
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
