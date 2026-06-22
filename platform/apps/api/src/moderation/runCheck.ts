import type { InputFile, Outcome } from "@repo/shared";

export interface AcceptanceCriterion {
  description: string;
}

export interface CheckResult {
  outcome: Outcome; // "pass" | "fail"
  reasoning: string;
}

/**
 * Step 6 — `runCheck`: the swappable verdict brain. The interface is fixed —
 * acceptance criteria + the decrypted files in, an outcome + reasoning out — so
 * the AI moderator drops in later WITHOUT touching the runner or the on-chain code.
 *
 * V1 STUB: there is no AI yet, so the verdict is the operator's manual decision
 * (passed in via `manual`). The real implementation will analyze `files` against
 * `criteria` (CI checks, then AI) and ignore `manual`.
 */
export async function runCheck(
  criteria: AcceptanceCriterion[],
  files: InputFile[],
  manual: { outcome: Outcome; note?: string }
): Promise<CheckResult> {
  void criteria; // consumed by the real CI/AI implementation
  void files;
  return {
    outcome: manual.outcome,
    reasoning: manual.note ?? `manual ${manual.outcome} verdict (V1 stub — no AI yet)`,
  };
}
