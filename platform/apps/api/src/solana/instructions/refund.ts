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
  readPanelWallets,
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
 * verification fee. The panel is read here and EVERY seat's token account goes
 * in as a remaining account, in panel order — not just the voters, whose number
 * changes as votes land and would leave a transaction built moments earlier
 * carrying the wrong count. The program skips seats that did not vote.
 *
 * On a ghost-timeout no seat can hold a vote, so nobody is paid and the full
 * deposit returns.
 */
export async function buildRefund(p: BuildRefundParams): Promise<string> {
  const initiatorTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.initiator);

  const ixs: TransactionInstruction[] = [];
  const seats = await readPanelWallets(p.escrow);
  const seatTokenAccounts = seats.map((moderator) => {
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
      seatTokenAccounts.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: true,
      }))
    )
    .instruction();
  ixs.push(refundIx);

  return finalizeUnsigned(new Transaction().add(...ixs), p.initiator);
}
