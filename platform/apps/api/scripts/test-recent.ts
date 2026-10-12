import { strict as assert } from "node:assert";
import type { ContractModerator, Outcome } from "@repo/shared";
import { classifySeat } from "../src/moderation/seatResult";

const seat = (vote: ContractModerator["vote"], filledBy?: string): ContractModerator => ({
  wallet: "mod", recipient: "age1", fee: "1", label: "Mod", vote, ...(filledBy ? { filledBy } : {}),
});
const is = (s: ContractModerator, outcome: Outcome | null, size: number, want: string | null, why: string) =>
  assert.equal(classifySeat(s, outcome, size), want, why);

is(seat("pass"), null, 3, null, "no outcome (ghost timeout) is not a result");
is(seat("pass", "tb"), "pass", 3, "silent", "replaced by a tiebreaker");
is(seat("committed", "tb"), "fail", 3, "silent", "replaced wins over anything cached for the seat");
is(seat(undefined), "pass", 3, null, "never cached: skipped, not guessed");
is(seat("committed"), "pass", 3, "withheld", "committed, never revealed");
is(seat(null), "fail", 3, "silent", "never voted");
is(seat(null), "pass", 1, "silent", "a silent panel of one");
is(seat("pass"), "inconclusive", 3, "split", "voted, no majority");
is(seat(null), "inconclusive", 3, "silent", "silent on an Inconclusive contract");
is(seat("fail"), "fail", 1, "solo", "decided alone");
is(seat("pass"), "pass", 3, "majority", "with the majority");
is(seat("fail"), "pass", 3, "minority", "outvoted");
is(seat("mismatch"), "pass", 3, "mismatch", "revealed a different vote than it committed");
is({ ...seat("pass", "tb"), replacedVote: "mismatch" }, "pass", 3, "mismatch", "a mismatched seat a tiebreaker took");
is({ ...seat("pass", "tb"), replacedVote: "committed" }, "pass", 3, "withheld", "an unrevealed seat a tiebreaker took");
is({ ...seat("pass", "tb"), replacedVote: null }, "pass", 3, "silent", "a silent seat a tiebreaker took");

console.log("form guide ✓");
