import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { connection } from "./program";

/**
 * Set the fee payer + a recent blockhash and serialize to base64 WITHOUT
 * signatures — the wallet signs it. Shared by every instruction builder.
 */
export async function finalizeUnsigned(
  tx: Transaction,
  feePayer: PublicKey,
  conn: Connection = connection
): Promise<string> {
  tx.feePayer = feePayer;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}
