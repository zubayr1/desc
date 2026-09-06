/**
 * Judge selection — the one place that knows which implementation is live.
 *
 * `DESC_JUDGE=claude` uses the AI moderator; anything else (including unset)
 * falls back to the operator's manual decision. Defaulting to manual is
 * deliberate: turning on automated verdicts should be a choice someone made,
 * not something a missing env var does for them.
 */
import type { Outcome } from "@repo/shared";
import type { Judge } from "./types";
import { claudeJudge } from "./claude";
import { manualJudge } from "./manual";

export function selectJudge(manual?: { outcome: Outcome; note?: string }): Judge {
  if (process.env.DESC_JUDGE === "claude") return claudeJudge();
  if (!manual) {
    throw new Error(
      "no judge available: DESC_JUDGE is not `claude` and no manual outcome was given"
    );
  }
  return manualJudge(manual);
}

export type { Judge, JudgeResult, Usage, CriterionVerdict, AcceptanceCriterion } from "./types";
export { JudgeError } from "./types";
