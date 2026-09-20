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

export interface BuildReleaseParams {
  signer: PublicKey; // initiator OR committer (the one claiming)
  committer: PublicKey;
  escrow: PublicKey;
  vault: PublicKey;
  treasury: PublicKey; // = Config.treasury
  initiator: PublicKey; // vault + panel rent on close, and any unspent mod fee
}

/**
 * Build the unsigned `release` transaction, signed by either party.
 *
 * Who is paid comes from the escrow's **panel**, read here rather than passed
 * in: each moderator that voted gets its own snapshotted price, and their token
 * accounts go in as remaining accounts **in panel order** — the program matches
 * each one against its own seat. A moderator that never voted is not paid and
 * its fee returns to the initiator, which is why the initiator's token account
 * is required even when nothing comes back to them.
 *
 * Idempotent creates are prepended for every payout account, so each transfer
 * has somewhere to land. A no-mod escrow has an empty panel and adds none.
 */
export async function buildRelease(p: BuildReleaseParams): Promise<string> {
  const committerTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.committer);
  const initiatorTokenAccount = getAssociatedTokenAddressSync(usdcMint, p.initiator);

  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      p.signer, // payer
      committerTokenAccount,
      p.committer, // owner
      usdcMint
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      p.signer,
      initiatorTokenAccount,
      p.initiator,
      usdcMint
    ),
  ];

  const voters = await readPanelVoters(p.escrow);
  const voterTokenAccounts = voters.map((moderator) => {
    const ata = getAssociatedTokenAddressSync(usdcMint, moderator);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(p.signer, ata, moderator, usdcMint)
    );
    return ata;
  });

  const releaseIx = await program.methods
    .release()
    .accountsPartial({
      signer: p.signer,
      escrow: p.escrow,
      config: platformConfigPda,
      panel: panelPda(p.escrow),
      vault: p.vault,
      committerTokenAccount,
      treasury: p.treasury,
      initiatorTokenAccount,
      initiator: p.initiator,
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
  ixs.push(releaseIx);

  return finalizeUnsigned(new Transaction().add(...ixs), p.signer);
}
