/**
 * The operator's own decision, wearing the Judge interface.
 *
 * This is what shipped before there was any AI, and it stays: the e2e scripts
 * and the on-chain tests need a verdict they control, and an operator needs a
 * way to settle a contract by hand when a check is inconclusive.
 */
import type { InputFile, Outcome } from "@repo/shared";
import type { AcceptanceCriterion, Judge, JudgeResult } from "./types";

export function manualJudge(manual: { outcome: Outcome; note?: string }): Judge {
  return {
    name: "manual",
    async judge(
      criteria: AcceptanceCriterion[],
      files: InputFile[]
    ): Promise<JudgeResult> {
      void files; // a human already looked; the files are not re-read here
      return {
        outcome: manual.outcome,
        reasoning: manual.note ?? `manual ${manual.outcome} verdict`,
        // Attribute the single decision to every criterion — there is no
        // per-criterion detail to invent, and claiming otherwise would be a lie
        // in the audit trail.
        criteria: criteria.map((c) => ({
          description: c.description,
          met: manual.outcome === "pass",
          reason: "decided by the operator, not checked individually",
        })),
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      };
    },
  };
}
