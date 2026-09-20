import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  program,
  platformConfigPda,
  usdcMint,
  panelPda,
  readPanelVoters,
} from "../program";
import { finalizeUnsigned } from "../buildTransaction";

export interface BuildRefundParams {
  initiator: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
  /** = Config.treasury. Receives the verification fee on a Fail verdict; nothing
   *  on a ghost-timeout, but the account is always required by the program. */
  treasury: PublicKey;
}

/**
 * Build the unsigned `refund` transaction. Initiator = fee payer + signer.
 *
 * On a Fail verdict every moderator that voted is paid its own price — the
 * outvoted one included, since it did the same work — and the treasury keeps the
 * verification fee. The voters come from the escrow's **panel**, read here, and
 * their token accounts go in as remaining accounts in panel order.
 *
 * On a ghost-timeout nobody judged, so the panel has no voters, the list is
 * empty and the full deposit returns.
 */
export async function buildRefund(p: BuildRefundParams): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.initiator);

  const ixs: TransactionInstruction[] = [];
  const voters = await readPanelVoters(p.escrow);
  const voterTokenAccounts = voters.map((moderator) => {
    const ata = getAssociatedTokenAddressSync(usdcMint, moderator);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        p.initiator, // payer
        ata,
        moderator, // owner
        usdcMint
      )
    );
    return ata;
  });

  const refundIx = await program.methods
    .refund()
    .accountsPartial({
      initiator: p.initiator,
      escrow: p.escrow,
      config: platformConfigPda,
      panel: panelPda(p.escrow),
      vault: p.vault,
      initiatorTokenAccount,
      treasury: p.treasury,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(
      voterTokenAccounts.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: true,
      }))
    )
    .instruction();
  ixs.push(refundIx);

  return finalizeUnsigned(new Transaction().add(...ixs), p.initiator);
}
