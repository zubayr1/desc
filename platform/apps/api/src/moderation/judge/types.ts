/**
 * The judge seam.
 *
 * `runCheck` is what `mod-run` calls and its signature never changes. Behind it,
 * a Judge decides whether a deliverable meets its criteria. Swapping Claude for
 * CI checks, a different model, or a remote service means adding a sibling file
 * here — nothing above this line moves.
 */
import type { InputFile, Outcome } from "@repo/shared";

export interface AcceptanceCriterion {
  description: string;
}

/** One criterion, judged. Kept per-criterion so a Fail can say which part failed. */
export interface CriterionVerdict {
  description: string;
  met: boolean;
  reason: string;
}

/**
 * What the check cost to run. Present on every judge, including free ones (which
 * report zeros), because moderation fees are meant to scale with the work done —
 * and that needs measurements from the first verdict, not from the day we start
 * pricing it.
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface JudgeResult {
  outcome: Outcome;
  /** Human-readable summary. Goes on-chain via the verdict hash. */
  reasoning: string;
  criteria: CriterionVerdict[];
  usage: Usage;
}

export interface Judge {
  /** Recorded alongside the verdict so a dispute can tell what judged it. */
  readonly name: string;
  judge(criteria: AcceptanceCriterion[], files: InputFile[]): Promise<JudgeResult>;
}

/**
 * Thrown when a judge cannot reach a trustworthy decision — model error, bundle
 * over budget, unparseable response.
 *
 * FAIL CLOSED: the caller must submit NO verdict. It must never be caught and
 * turned into a Pass; a silent Pass releases funds for an unchecked deliverable.
 * An escrow with no verdict is already handled — it times out and refunds.
 */
export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeError";
  }
}
