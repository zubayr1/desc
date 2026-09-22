/**
 * Where a moderator's work comes from, and how it is claimed.
 *
 * The seam exists because this changes twice on the way to V2:
 *
 *   today  — our moderators, each seeing only the contracts whose panel it sits
 *            on, read from our own database because they run inside our
 *            infrastructure.
 *   V2     — many moderators, each polling `GET /moderation/queue` over HTTP and
 *            seeing ONLY the contracts it was assigned. A mod is not on every
 *            contract once assignment is random, and handing it work it was not
 *            picked for would let it judge anything it liked.
 *
 * Every method therefore takes the moderator's pubkey: work, claims and
 * failures are all per SEAT, never per contract. When the queue endpoint lands
 * it becomes a second implementation of this interface — the watcher loop above
 * it does not change.
 */
import type { PublicKey } from "@solana/web3.js";

export interface WorkItem {
  contractId: string;
  /** For logs — the escrow is re-read from chain by `mod-run` anyway. */
  escrowAddress: string | null;
  title: string | null;
  /** How many times this contract has been claimed, including now. */
  attempts: number;
}

export interface WorkSource {
  /** Named in logs so it is obvious which source a run used. */
  readonly name: string;

  /**
   * Take ownership of the panel seats this moderator should judge.
   *
   * Claiming MUST be atomic: two workers that both read-then-write would each
   * judge the same contract and each pay for the inference, while the chain
   * accepts only one vote per seat.
   */
  claim(moderator: PublicKey): Promise<WorkItem[]>;

  /** This moderator has voted — close its claim. Per moderator, not per
   *  contract: the other seats on a panel of three may still be working. */
  release(contractId: string, moderator: PublicKey): Promise<void>;

  /** This moderator could not judge it. Recorded with a reason and never
   *  retried — the rest of the panel is unaffected and can still settle it. */
  fail(contractId: string, moderator: PublicKey, error: string): Promise<void>;
}
