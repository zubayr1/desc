import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { program, usdcMint } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildMutualCancelParams {
  initiator: PublicKey;
  committer: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
}

/** Build the unsigned `mutual_cancel` transaction. Requires BOTH the initiator
 *  and the committer to sign before submission. Fee payer = initiator. */
export async function buildMutualCancel(
  p: BuildMutualCancelParams
): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    p.initiator
  );

  const ix = await program.methods
    .mutualCancel()
    .accountsPartial({
      initiator: p.initiator,
      committer: p.committer,
      escrow: p.escrow,
      vault: p.vault,
      initiatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return finalizeUnsigned(new Transaction().add(ix), p.initiator);
}
