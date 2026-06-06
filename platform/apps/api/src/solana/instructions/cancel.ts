import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { program, usdcMint } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildCancelParams {
  initiator: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
}

/** Build the unsigned `cancel` transaction (initiator reclaims a funded,
 *  unaccepted escrow). Initiator = fee payer + signer. */
export async function buildCancel(p: BuildCancelParams): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    p.initiator
  );

  const ix = await program.methods
    .cancel()
    .accountsPartial({
      initiator: p.initiator,
      escrow: p.escrow,
      vault: p.vault,
      initiatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return finalizeUnsigned(new Transaction().add(ix), p.initiator);
}
