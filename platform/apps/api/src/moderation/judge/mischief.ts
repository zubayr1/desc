/**
 * Mischief — a test moderator that judges honestly and then votes the opposite
 * way (`slug` or `slug:wrong`), or never votes at all (`slug:silent`), so a
 * panel can be seen outvoting it or a tiebreaker taking its seat.
 *
 * It exists to prove the panel works. A 3-moderator contract should settle
 * correctly with one bad panellist on it, and the only way to know that is to
 * put one there. Asserting it in a unit test proves the tally; running it end to
 * end proves the whole path — sealing to three recipients, three watchers
 * claiming three seats, the majority settling, and the outvoted moderator still
 * being paid.
 *
 * It runs the REAL judge first and inverts the answer, rather than returning a
 * constant. A stub would finish instantly and cost nothing, so it would prove
 * nothing about timing, cost accounting, or the payout path — which is exactly
 * what the test is for. The inference is really spent, and Mischief really earns
 * its fee.
 *
 * Two guards, because a moderator that inverts verdicts on a live contract would
 * fail honest work and release funds for bad work:
 *   1. it must be named explicitly in `DESC_MISCHIEF_MODS`
 *   2. the cluster must allow test moderators (`DESC_ENV` is not mainnet)
 * Both are checked when the judge is built, so a misconfigured run dies at
 * startup rather than halfway through a contract.
 */
import type { InputFile } from "@repo/shared";
import { cluster } from "../../config/cluster";
import type { Judge, JudgeResult } from "./types";

export type MischiefMode = "wrong" | "silent";

/**
 * Test moderators from `DESC_MISCHIEF_MODS`: comma-separated `slug[:wrong|silent]`,
 * default `wrong`. An unset variable means none — the variable naming a
 * moderator IS the opt-in.
 */
function mischiefModes(): Map<string, MischiefMode> {
  const out = new Map<string, MischiefMode>();
  for (const entry of (process.env.DESC_MISCHIEF_MODS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [slug, mode = "wrong"] = entry.split(":").map((s) => s.trim());
    if (mode !== "wrong" && mode !== "silent") {
      throw new Error(`DESC_MISCHIEF_MODS: "${entry}" — the mode must be wrong or silent`);
    }
    out.set(slug, mode);
  }
  return out;
}

/** Is this a test moderator, in either mode? */
export const isMischief = (slug: string): boolean => mischiefModes().has(slug);

/** How this moderator misbehaves, or null for an honest one. Refuses a cluster without test moderators. */
export function mischiefMode(slug: string): MischiefMode | null {
  const mode = mischiefModes().get(slug) ?? null;
  if (mode && !cluster.allowsTestModerators) {
    throw new Error(`refusing to run the Mischief moderator on ${cluster.label}`);
  }
  return mode;
}

/**
 * Wrap a real judge so its verdict comes out backwards.
 *
 * The per-criterion results are inverted too, not just the outcome: a verdict
 * that said PASS while every criterion was met would be obviously broken, and
 * the point is to look like a moderator that genuinely disagrees.
 */
export function mischiefJudge(inner: Judge, slug: string): Judge {
  if (mischiefMode(slug) !== "wrong") {
    throw new Error(
      `${slug} is not listed in DESC_MISCHIEF_MODS as wrong — refusing to invert its verdicts`
    );
  }
  // Belt and braces: `config/env` already refuses to start the server on a
  // cluster that does not allow test moderators. This catches a script that
  // built a judge without going through it.
  if (!cluster.allowsTestModerators) {
    throw new Error(
      `refusing to run the Mischief moderator on ${cluster.label} — it deliberately returns wrong verdicts`
    );
  }

  return {
    name: `mischief(${inner.name})`,

    async judge(criteria, files: InputFile[]): Promise<JudgeResult> {
      const real = await inner.judge(criteria, files);
      const flipped = real.outcome === "pass" ? "fail" : "pass";
      return {
        outcome: flipped,
        // Says so in the text that gets hashed on-chain: anyone reading this
        // verdict later can see it was a test moderator, not a real judgment.
        reasoning:
          `[MISCHIEF — test moderator, verdict deliberately inverted] ` +
          `honest verdict was ${real.outcome.toUpperCase()}: ${real.reasoning}`,
        criteria: real.criteria.map((c) => ({
          ...c,
          met: !c.met,
          reason: `[inverted] ${c.reason}`,
        })),
        // The real cost of the real check — Mischief is paid like any other
        // moderator, so its usage has to be accounted like any other.
        usage: real.usage,
      };
    },
  };
}
