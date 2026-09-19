/**
 * Judge selection — the one place that knows which implementation is live.
 *
 *   DESC_JUDGE=claude      AI moderator on the Claude SUBSCRIPTION (Claude Code
 *                          headless). No API credits are used.
 *   DESC_JUDGE=claude-api  AI moderator on the Anthropic API — billed as API
 *                          usage. Needed where there is no Claude Code login,
 *                          e.g. a hosted server.
 *   anything else          the operator's manual decision.
 *
 * Defaulting to manual is deliberate: turning on automated verdicts should be
 * a choice someone made, not something a missing env var does for them.
 */
import type { Outcome } from "@repo/shared";
import type { Judge } from "./types";
import { claudeJudge } from "./claude";
import { claudeCodeJudge } from "./claudeCode";
import { manualJudge } from "./manual";

/** True when DESC_JUDGE selects one of the AI moderators. */
export const aiJudgeSelected = () =>
  process.env.DESC_JUDGE === "claude" || process.env.DESC_JUDGE === "claude-api";

/** The AI judge DESC_JUDGE asks for — the subscription one unless told otherwise. */
export function aiJudge(): Judge {
  return process.env.DESC_JUDGE === "claude-api" ? claudeJudge() : claudeCodeJudge();
}

export function selectJudge(manual?: { outcome: Outcome; note?: string }): Judge {
  if (aiJudgeSelected()) return aiJudge();
  if (!manual) {
    throw new Error(
      "no judge available: DESC_JUDGE is not `claude` or `claude-api`, and no manual outcome was given"
    );
  }
  return manualJudge(manual);
}

export type { Judge, JudgeResult, Usage, CriterionVerdict, AcceptanceCriterion } from "./types";
export { JudgeError } from "./types";
