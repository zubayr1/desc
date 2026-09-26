import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { connection } from "./program";

/**
 * Set the fee payer + a recent blockhash and serialize to base64 WITHOUT
 * signatures — the wallet signs it. Shared by every instruction builder.
 *
 * The blockhash is fetched at **finalized**, not the connection's default of
 * confirmed. A confirmed blockhash is newer, but a public RPC endpoint is a
 * pool of nodes behind one address: the node that answered may be a block or
 * two ahead of the node we later submit to, which then rejects the whole thing
 * with "Blockhash not found" though nothing expired. Every node has the
 * finalized one. It costs about 13 seconds of the ~60-second validity window,
 * which matters far less than a transaction that fails after the user has
 * already approved it in their wallet.
 */
export async function finalizeUnsigned(
  tx: Transaction,
  feePayer: PublicKey,
  conn: Connection = connection
): Promise<string> {
  tx.feePayer = feePayer;
  tx.recentBlockhash = (await conn.getLatestBlockhash("finalized")).blockhash;
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}
