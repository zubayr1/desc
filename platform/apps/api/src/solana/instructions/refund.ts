import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { program, usdcMint } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildRefundParams {
  initiator: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
}

/** Build the unsigned `refund` transaction (initiator reclaims the full
 *  deposit on a Fail verdict or ghost-timeout). Initiator = fee payer + signer. */
export async function buildRefund(p: BuildRefundParams): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    p.initiator
  );

  const ix = await program.methods
    .refund()
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
