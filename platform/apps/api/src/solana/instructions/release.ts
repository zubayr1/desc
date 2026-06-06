import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { program, platformConfigPda, usdcMint } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildReleaseParams {
  signer: PublicKey; // initiator OR committer (the one claiming)
  committer: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
  treasury: PublicKey; // = Config.treasury
  initiator: PublicKey; // vault rent destination on close
}

/** Build the unsigned `release` transaction. Prepends an idempotent create of
 *  the committer's USDC account so the payout always has somewhere to land.
 *  Signed by either party. */
export async function buildRelease(p: BuildReleaseParams): Promise<string> {
  const committerTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    p.committer
  );

  const ensureAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    p.signer, // payer
    committerTokenAccount,
    p.committer, // owner
    usdcMint
  );

  const releaseIx = await program.methods
    .release()
    .accountsPartial({
      signer: p.signer,
      escrow: p.escrow,
      config: platformConfigPda,
      vault: p.vault,
      committerTokenAccount,
      treasury: p.treasury,
      initiator: p.initiator,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return finalizeUnsigned(
    new Transaction().add(ensureAtaIx, releaseIx),
    p.signer
  );
}
