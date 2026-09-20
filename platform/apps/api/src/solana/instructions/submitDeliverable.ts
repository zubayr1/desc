import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { program, platformConfigPda, usdcMint, panelPda } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildSubmitDeliverableParams {
  committer: PublicKey;
  escrow: PublicKey;
  deliverableHashBytes: number[]; // [u8; 32]
  /** No-mod escrow: settle in the same transaction (see below). */
  settle?: {
    vault: PublicKey;
    treasury: PublicKey; // = Config.treasury
    initiator: PublicKey; // vault rent destination on close
  };
}

/**
 * Build the unsigned `submit` transaction (committer = fee payer + signer).
 *
 * On a **no-mod** escrow, `submit` records the Pass itself, so there is nothing
 * left to decide — appending `release` to the same transaction settles it in one
 * signature instead of parking the contract at "submitted" behind a pointless
 * click. Instruction 2 sees instruction 1's writes, so `release` finds the Pass
 * it requires. `release` accepts either party as signer, and the committer
 * qualifies. It's atomic: if the payout can't happen, the submission doesn't
 * either.
 */
export async function buildSubmitDeliverable(
  p: BuildSubmitDeliverableParams
): Promise<string> {
  const tx = new Transaction();

  tx.add(
    await program.methods
      .submit(p.deliverableHashBytes)
      .accountsPartial({ committer: p.committer, escrow: p.escrow })
      .instruction()
  );

  if (p.settle) {
    const committerTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.committer);
    const initiatorTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      p.settle.initiator
    );
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        p.committer, // payer
        committerTokenAccount,
        p.committer, // owner
        usdcMint
      )
    );
    // `release` always takes the initiator's account (unspent moderator fees go
    // back there). A no-mod escrow has none to return, but the account is still
    // read, so make sure it exists.
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        p.committer,
        initiatorTokenAccount,
        p.settle.initiator,
        usdcMint
      )
    );
    tx.add(
      await program.methods
        .release()
        .accountsPartial({
          signer: p.committer,
          escrow: p.escrow,
          config: platformConfigPda,
          panel: panelPda(p.escrow),
          vault: p.settle.vault,
          committerTokenAccount,
          treasury: p.settle.treasury,
          initiatorTokenAccount,
          initiator: p.settle.initiator,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
    );
  }

  return finalizeUnsigned(tx, p.committer);
}
