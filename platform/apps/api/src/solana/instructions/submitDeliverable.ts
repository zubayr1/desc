import { PublicKey, Transaction } from "@solana/web3.js";
import { program } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildSubmitDeliverableParams {
  committer: PublicKey;
  escrow: PublicKey;
  deliverableHashBytes: number[]; // [u8; 32]
}

/** Build the unsigned `submit` transaction (committer = fee payer + signer). */
export async function buildSubmitDeliverable(
  p: BuildSubmitDeliverableParams
): Promise<string> {
  const ix = await program.methods
    .submit(p.deliverableHashBytes)
    .accountsPartial({ committer: p.committer, escrow: p.escrow })
    .instruction();

  return finalizeUnsigned(new Transaction().add(ix), p.committer);
}
