import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { program, usdcMint } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildRefundParams {
  initiator: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
  /** Present on a Fail verdict — the judging mod receives the surcharge. Omit on
   *  a ghost-timeout (no verdict → full refund, no moderator account). */
  moderator?: PublicKey;
}

/** Build the unsigned `refund` transaction. On a Fail verdict the moderator's
 *  USDC account is wired in (gets the surcharge); on a ghost-timeout it's omitted
 *  and the full deposit returns. Initiator = fee payer + signer. */
export async function buildRefund(p: BuildRefundParams): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.initiator);

  const ixs: TransactionInstruction[] = [];
  let moderatorTokenAccount: PublicKey | null = null;
  if (p.moderator) {
    moderatorTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.moderator);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        p.initiator, // payer
        moderatorTokenAccount,
        p.moderator, // owner
        usdcMint
      )
    );
  }

  const refundIx = await program.methods
    .refund()
    .accountsPartial({
      initiator: p.initiator,
      escrow: p.escrow,
      vault: p.vault,
      initiatorTokenAccount,
      // optional account — null on a ghost-timeout (no moderator paid)
      moderatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  ixs.push(refundIx);

  return finalizeUnsigned(new Transaction().add(...ixs), p.initiator);
}
