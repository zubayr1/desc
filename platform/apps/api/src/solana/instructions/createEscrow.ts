import anchorPkg from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { program, platformConfigPda, usdcMint } from "../program";
import { finalizeUnsigned } from "../buildTransaction";

// `BN` isn't a statically-detectable named export of the CJS anchor package
// under ESM — pull it off the default (module.exports) object at runtime.
const { BN } = anchorPkg;

export interface BuildCreateEscrowParams {
  initiator: PublicKey;
  contractIdBytes: number[]; // [u8; 16]
  escrow: PublicKey;
  vault: PublicKey;
  amount: string; // base units
  moderatorCount: number;
  moderatorSurcharge: string; // base units
  deadlineUnix: number;
  /** Initiator opted out of moderation — the program checks count/surcharge are 0. */
  noMod: boolean;
}

/** Build the unsigned `create_escrow` transaction (initiator = fee payer + signer). */
export async function buildCreateEscrow(
  p: BuildCreateEscrowParams
): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    p.initiator
  );

  const ix = await program.methods
    .createEscrow(
      p.contractIdBytes,
      new BN(p.amount),
      p.moderatorCount,
      new BN(p.moderatorSurcharge),
      new BN(p.deadlineUnix),
      p.noMod
    )
    .accountsPartial({
      initiator: p.initiator,
      config: platformConfigPda,
      mint: usdcMint,
      escrow: p.escrow,
      vault: p.vault,
      initiatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return finalizeUnsigned(new Transaction().add(ix), p.initiator);
}
