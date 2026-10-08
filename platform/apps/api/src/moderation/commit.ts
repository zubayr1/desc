/**
 * Commit–reveal for a panel moderator: the salt, the commit hash (mirrors
 * `desc_escrow::panel::commit_hash`), the chain clock, and the reveal sweep.
 */
import { createHash, createHmac } from "node:crypto";
import type { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import type { DescEscrow } from "../solana/idl/desc_escrow";
import type { WorkSource } from "./watch/source";

export const VOTE_NONE = 0;
export const VOTE_PASS = 1;
export const VOTE_FAIL = 2;
export const VOTE_COMMITTED = 3;

type Vote = "pass" | "fail";

/** Secret and recomputable: keyed by the moderator's own secret key, so nothing
 *  needs storing and nobody else can derive it. */
export function commitSalt(moderator: Keypair, escrow: PublicKey): Buffer {
  return createHmac("sha256", Buffer.from(moderator.secretKey.slice(0, 32)))
    .update("desc:commit-salt:")
    .update(escrow.toBuffer())
    .digest();
}

export function commitHash(
  vote: Vote,
  verdictHash: Buffer,
  salt: Buffer,
  moderator: PublicKey,
  escrow: PublicKey
): Buffer {
  return createHash("sha256")
    .update(Buffer.from([vote === "pass" ? VOTE_PASS : VOTE_FAIL]))
    .update(verdictHash)
    .update(salt)
    .update(moderator.toBuffer())
    .update(escrow.toBuffer())
    .digest();
}

/** The validator's clock — what the program compares deadlines against. */
export async function chainNow(connection: Connection): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (!info) throw new Error("clock sysvar unavailable");
  return Number(info.data.readBigInt64LE(32));
}

const voteArg = (v: Vote) => (v === "pass" ? { pass: {} } : { fail: {} });

/**
 * Reveal every vote this moderator committed, as soon as reveals open. Run on
 * each watcher tick; a claim stays `committed` until it is revealed or can no
 * longer be.
 */
export async function revealCommitted(
  source: WorkSource,
  moderator: Keypair,
  escrowProgram: Program<DescEscrow>,
  log: (line: string) => void = console.log
): Promise<void> {
  const me = moderator.publicKey;
  for (const c of await source.committed(me)) {
    const escrow = new PublicKey(c.escrowAddress);
    try {
      const esc = await escrowProgram.account.escrow.fetch(escrow);
      const panel = await escrowProgram.account.panel.fetchNullable(esc.panel);
      const seat = panel?.entries.slice(0, panel.count).find((e) => e.moderator.equals(me));

      if (seat && (seat.vote === VOTE_PASS || seat.vote === VOTE_FAIL)) {
        await source.release(c.contractId, me);
        continue;
      }
      if (!panel || !seat || !("submitted" in (esc.status as object))) {
        await source.fail(c.contractId, me, "settled or replaced before the reveal");
        continue;
      }

      const now = await chainNow(escrowProgram.provider.connection);
      if (now > esc.revealDeadline.toNumber()) {
        await source.fail(c.contractId, me, "reveal window closed");
        continue;
      }
      const allCommitted = panel.entries.slice(0, panel.count).every((e) => e.vote !== 0);
      if (!allCommitted && now <= esc.commitDeadline.toNumber()) continue;

      await escrowProgram.methods
        .revealVerdict(
          me,
          voteArg(c.outcome) as never,
          Array.from(Buffer.from(c.verdictHash, "hex")),
          Array.from(commitSalt(moderator, escrow))
        )
        .accountsPartial({ payer: me, escrow, panel: esc.panel })
        .rpc();
      await source.release(c.contractId, me);
      log(`  revealed ${c.outcome.toUpperCase()} on ${c.contractId}`);
    } catch (err) {
      log(`  ! reveal failed for ${c.contractId}: ${(err as Error).message}`);
    }
  }
}
