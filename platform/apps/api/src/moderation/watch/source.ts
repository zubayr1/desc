/**
 * Where a moderator's work comes from.
 *
 * The seam exists because this changes twice on the way to V2:
 *
 *   today  — one moderator (ours), every submitted contract, read from our own
 *            database because the moderator runs inside our infrastructure.
 *   V2     — many moderators, each polling `GET /moderation/queue` over HTTP and
 *            seeing ONLY the contracts it was assigned. A mod is not on every
 *            contract once assignment is random, and handing it work it was not
 *            picked for would let it judge anything it liked.
 *
 * `pending()` therefore takes the moderator's pubkey from the very first
 * version, even though the local source ignores it. When the queue endpoint
 * lands it becomes a second implementation of this interface — the watcher loop
 * above it does not change.
 */
import type { PublicKey } from "@solana/web3.js";

export interface WorkItem {
  contractId: string;
  /** For logs — the escrow is re-read from chain by `mod-run` anyway. */
  escrowAddress: string | null;
  title: string | null;
}

export interface WorkSource {
  /** Named in logs so it is obvious which source a run used. */
  readonly name: string;
  pending(moderator: PublicKey): Promise<WorkItem[]>;
}
