import anchorPkg from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

// `BN` isn't a statically-detectable named export of the CJS anchor package
// under ESM, so pull it off the default (module.exports) object at runtime.
const { BN } = anchorPkg;
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  connection,
  program,
  platformConfigPda,
  usdcMint,
} from "./program";

/** Serialize a built transaction to base64 WITHOUT signatures (the wallet signs). */
async function toUnsignedBase64(
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

export interface BuildCreateEscrowParams {
  initiator: PublicKey;
  contractIdBytes: number[]; // [u8; 16]
  escrow: PublicKey;
  vault: PublicKey;
  amount: string; // base units
  moderatorCount: number;
  moderatorSurcharge: string; // base units
  deadlineUnix: number;
}

/** Build the unsigned `create_escrow` transaction (initiator = fee payer + signer). */
export async function buildCreateEscrowTx(
  p: BuildCreateEscrowParams
): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    p.initiator
  );

  const ix = await program.methods
    .createEscrow(
      p.contractIdBytes,
      new BN(p.amount),
      p.moderatorCount,
      new BN(p.moderatorSurcharge),
      new BN(p.deadlineUnix)
    )
    .accountsPartial({
      initiator: p.initiator,
      config: platformConfigPda,
      mint: usdcMint,
      escrow: p.escrow,
      vault: p.vault,
      initiatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return toUnsignedBase64(new Transaction().add(ix), p.initiator);
}

/** Submit a wallet-signed (base64) transaction and wait for confirmation. */
export async function submitSigned(signedTxB64: string): Promise<string> {
  const raw = Buffer.from(signedTxB64, "base64");
  const signature = await connection.sendRawTransaction(raw);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
    "confirmed"
  );
  return signature;
}
