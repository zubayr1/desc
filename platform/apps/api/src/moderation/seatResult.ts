import type { ContractModerator, Outcome, RecentResult } from "@repo/shared";

/** One seat of a finished contract, from its original moderator's side. Null: not counted. */
export function classifySeat(
  seat: ContractModerator,
  outcome: Outcome | null,
  panelSize: number
): RecentResult | null {
  if (!outcome) return null;
  if (seat.filledBy) return "silent";
  // Cached before votes were: skip rather than guess.
  if (seat.vote === undefined) return null;
  if (seat.vote === "mismatch") return "mismatch";
  if (seat.vote === "committed") return "withheld";
  if (seat.vote === null) return "silent";
  if (outcome === "inconclusive") return "split";
  if (panelSize === 1) return "solo";
  return seat.vote === outcome ? "majority" : "minority";
}
