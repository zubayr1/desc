import { strict as assert } from "node:assert";
import { roundRobin } from "../src/moderation/tiebreak/roundRobin";
import { tiebreakPhase } from "../src/moderation/tiebreak/phase";

const rr = roundRobin(["t1", "t2", "t3", "t4"], (t) => t);
const none = new Set<string>();

assert.deepEqual([rr.pick(none), rr.pick(none), rr.pick(none), rr.pick(none), rr.pick(none)],
  ["t1", "t2", "t3", "t4", "t1"], "takes turns and wraps");

assert.equal(rr.pick(new Set(["t2"])), "t3", "skips an excluded one");
assert.equal(rr.pick(none), "t4", "continues from after the one it gave out");
assert.equal(rr.pick(new Set(["t1", "t2", "t3", "t4"])), undefined, "nothing left");
assert.equal(rr.pick(none), "t1", "an empty pick leaves the turn unchanged");

const n = (v: number) => ({ toNumber: () => v });
const esc = { outcome: null, verdictWindow: n(300), revealDeadline: n(1000) };
const panel = (votes: number[], fills = 0) => ({ count: 3, tiebreakFills: fills, entries: votes.map((vote) => ({ vote })) });

assert.equal(tiebreakPhase(esc, panel([1, 2, 0]), 1000), "none", "voting still open");
assert.equal(tiebreakPhase(esc, panel([1, 2, 0]), 1001), "tiebreak", "1-1 with a silent seat");
assert.equal(tiebreakPhase(esc, panel([1, 2, 3]), 1001), "tiebreak", "an unrevealed seat counts as silent");
assert.equal(tiebreakPhase(esc, panel([0, 0, 0], 2), 1001), "finalize", "cap of two reached");
assert.equal(tiebreakPhase(esc, panel([0, 0, 0], 1), 1601), "finalize", "tiebreak window over");
assert.equal(tiebreakPhase(esc, panel([0, 0, 0], 1), 1600), "tiebreak", "last second of the window");
assert.equal(tiebreakPhase({ ...esc, outcome: { pass: {} } }, panel([1, 1, 0]), 2000), "none", "already decided");
assert.equal(tiebreakPhase(esc, { count: 1, tiebreakFills: 1, entries: [{ vote: 2 }] }, 1001), "finalize", "panel of one, cap one");

console.log("tiebreak ✓");
