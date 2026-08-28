import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
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
  /** The mod that judged — receives the 1% surcharge. Omitted on a no-mod
   *  escrow, where nobody judged and there is no surcharge. */
  moderator?: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
  treasury: PublicKey; // = Config.treasury
  initiator: PublicKey; // vault rent destination on close
}

/** Build the unsigned `release` transaction. Prepends idempotent creates of the
 *  payout accounts so every transfer has somewhere to land. On a no-mod escrow
 *  the moderator account is omitted entirely. Signed by either party. */
export async function buildRelease(p: BuildReleaseParams): Promise<string> {
  const committerTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.committer);

  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      p.signer, // payer
      committerTokenAccount,
      p.committer, // owner
      usdcMint
    ),
  ];

  let moderatorTokenAccount: PublicKey | null = null;
  if (p.moderator) {
    moderatorTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.moderator);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        p.signer,
        moderatorTokenAccount,
        p.moderator,
        usdcMint
      )
    );
  }

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
  ixs.push(releaseIx);

  return finalizeUnsigned(new Transaction().add(...ixs), p.signer);
}
