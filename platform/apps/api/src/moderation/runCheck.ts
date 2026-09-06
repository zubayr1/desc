/**
 * Step 6 — `runCheck`: the verdict seam.
 *
 * `mod-run` calls this and nothing else. The signature is fixed — criteria plus
 * the decrypted files in, an outcome plus reasoning out — so which judge decides
 * (operator, Claude, CI checks, something later) never reaches the runner or the
 * on-chain code.
 *
 * Errors are NOT swallowed. A judge that cannot reach a trustworthy answer
 * throws, `mod-run` submits no verdict, and the escrow follows its existing
 * timeout-and-refund path. Converting a failure here into a Pass would release
 * funds for a deliverable nobody checked.
 */
import type { InputFile, Outcome } from "@repo/shared";
import { selectJudge } from "./judge";
import type { AcceptanceCriterion, CriterionVerdict, Usage } from "./judge";

export type { AcceptanceCriterion };

export interface CheckResult {
  outcome: Outcome; // "pass" | "fail"
  reasoning: string;
  /** Which judge decided, for the audit trail. */
  judge: string;
  criteria: CriterionVerdict[];
  usage: Usage;
}

export async function runCheck(
  criteria: AcceptanceCriterion[],
  files: InputFile[],
  manual?: { outcome: Outcome; note?: string }
): Promise<CheckResult> {
  const judge = selectJudge(manual);
  const result = await judge.judge(criteria, files);
  return { ...result, judge: judge.name };
}
