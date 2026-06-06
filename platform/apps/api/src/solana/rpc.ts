import { connection } from "./program";

/** Send a wallet-signed (base64) transaction and wait for confirmation. */
export async function submitSignedTx(signedTxB64: string): Promise<string> {
  const raw = Buffer.from(signedTxB64, "base64");
  const signature = await connection.sendRawTransaction(raw);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      blockhash: bh.blockhash,
      lastValidBlockHeight: bh.lastValidBlockHeight,
    },
    "confirmed"
  );
  return signature;
}
