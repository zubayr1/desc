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
 *
 * Which moderator is asking matters too: a slug listed in `DESC_MISCHIEF_MODS`
 * gets its real judge wrapped so the verdict comes out backwards (see
 * `mischief.ts`). Every other moderator is unaffected.
 */
import type { Outcome } from "@repo/shared";
import type { Judge } from "./types";
import { claudeJudge } from "./claude";
import { claudeCodeJudge } from "./claudeCode";
import { manualJudge } from "./manual";
import { isMischief, mischiefJudge } from "./mischief";

/** True when DESC_JUDGE selects one of the AI moderators. */
export const aiJudgeSelected = () =>
  process.env.DESC_JUDGE === "claude" || process.env.DESC_JUDGE === "claude-api";

/**
 * The AI judge DESC_JUDGE asks for — the subscription one unless told otherwise.
 *
 * `slug` is the moderator this judge runs as. It only changes anything for a
 * test moderator listed in `DESC_MISCHIEF_MODS`; omit it where no moderator is
 * involved, such as `judge-check`.
 */
export function aiJudge(slug?: string): Judge {
  const base = process.env.DESC_JUDGE === "claude-api" ? claudeJudge() : claudeCodeJudge();
  return slug && isMischief(slug) ? mischiefJudge(base, slug) : base;
}

export function selectJudge(
  manual?: { outcome: Outcome; note?: string },
  slug?: string
): Judge {
  if (aiJudgeSelected()) return aiJudge(slug);
  if (!manual) {
    throw new Error(
      "no judge available: DESC_JUDGE is not `claude` or `claude-api`, and no manual outcome was given"
    );
  }
  return manualJudge(manual);
}

export type { Judge, JudgeResult, Usage, CriterionVerdict, AcceptanceCriterion } from "./types";
export { JudgeError } from "./types";
