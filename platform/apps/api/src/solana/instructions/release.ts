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
  moderator: PublicKey; // the mod that judged — receives the 1% surcharge
  escrow: PublicKey;
  vault: PublicKey;
  treasury: PublicKey; // = Config.treasury
  initiator: PublicKey; // vault rent destination on close
}

/** Build the unsigned `release` transaction. Prepends idempotent creates of the
 *  committer's and the moderator's USDC accounts so both payouts always have
 *  somewhere to land. Signed by either party. */
export async function buildRelease(p: BuildReleaseParams): Promise<string> {
  const committerTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.committer);
  const moderatorTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.moderator);

  const ensureCommitterAta = createAssociatedTokenAccountIdempotentInstruction(
    p.signer, // payer
    committerTokenAccount,
    p.committer, // owner
    usdcMint
  );
  const ensureModeratorAta = createAssociatedTokenAccountIdempotentInstruction(
    p.signer,
    moderatorTokenAccount,
    p.moderator,
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
      moderatorTokenAccount,
      initiator: p.initiator,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return finalizeUnsigned(
    new Transaction().add(ensureCommitterAta, ensureModeratorAta, releaseIx),
    p.signer
  );
}
