import { PublicKey, Transaction } from "@solana/web3.js";
import { program } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildAcceptParams {
  committer: PublicKey;
  escrow: PublicKey;
}

/** Build the unsigned `accept` transaction (committer = fee payer + signer). */
export async function buildAccept(p: BuildAcceptParams): Promise<string> {
  const ix = await program.methods
    .accept()
    .accountsPartial({ committer: p.committer, escrow: p.escrow })
    .instruction();

  return finalizeUnsigned(new Transaction().add(ix), p.committer);
}
