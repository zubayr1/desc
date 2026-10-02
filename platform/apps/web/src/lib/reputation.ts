import { moderatorAccuracy, type ModeratorOffer } from "@repo/shared";

/**
 * How a moderator's on-chain record is phrased, in one place.
 *
 * Both the picker and the moderators page render this, so the site can never
 * describe the same record two different ways.
 */
export interface RepDisplay {
  /** One short line, ready to render. */
  summary: string;
  /** How to colour that line. See `TONE_CLASS`. */
  tone: Tone;
  /** False when there is nothing to show — render the fallback text instead. */
  hasRecord: boolean;
  /** Share of panel verdicts that matched the majority, 0–1. Null when the
   *  moderator has never sat on a panel of three. */
  accuracy: number | null;
  /** It has failed nearly everything over a meaningful sample — see below. */
  failBias: boolean;
}

/**
 * How the line reads at a glance.
 *
 *   none   nothing to judge yet
 *   good   never outvoted
 *   plain  outvoted sometimes — normal, and not a verdict either way
 *   bad    outvoted more often than not, or failing nearly everything
 */
export type Tone = "none" | "good" | "plain" | "bad";

export const TONE_CLASS: Record<Tone, string> = {
  none: "text-zinc-600",
  good: "text-pass",
  plain: "text-muted",
  bad: "text-fail",
};

/** Below this, a moderator has been outvoted more often than it has agreed.
 *
 *  Deliberately applied at ANY sample size, including one verdict. A single
 *  disagreement is statistically nothing, but the line always prints the sample
 *  size beside it — "1 panel verdict · 0%" does not claim to be a judgement on
 *  the moderator, it just stops a bad one from being coloured like a good one.
 *  Styling by "has a record" rather than by the record was the earlier bug: it
 *  made a moderator outvoted every time look identical to one never outvoted. */
const OUTVOTED_MAJORITY = 0.5;

/** Fewest verdicts before a fail rate means anything. Three Fails in a row is a
 *  run of bad submissions; twenty is a moderator that is not reading them. */
const FAIL_BIAS_MIN_SAMPLE = 20;
const FAIL_BIAS_RATIO = 0.9;

export function reputationOf(m: ModeratorOffer): RepDisplay {
  const rep = m.reputation;
  const accuracy = moderatorAccuracy(rep);
  const failBias =
    !!rep &&
    rep.verdictsCast >= FAIL_BIAS_MIN_SAMPLE &&
    rep.failVotes / rep.verdictsCast >= FAIL_BIAS_RATIO;

  // No account yet, or an account that has never been written. Deliberately not
  // "0% accurate" — a moderator nobody has hired yet is not a bad moderator.
  if (!rep || rep.verdictsCast === 0) {
    return {
      summary: "no verdicts yet",
      tone: "none",
      hasRecord: false,
      accuracy,
      failBias,
    };
  }

  // Judged, but only ever alone. On a panel of one a moderator is its own
  // majority, so agreement there would read 100% and mean nothing.
  if (accuracy === null) {
    return {
      summary: `${rep.verdictsCast} verdict${rep.verdictsCast === 1 ? "" : "s"} · never on a panel`,
      // No agreement to judge, so nothing to praise or warn about — except a
      // moderator that has failed everything, which is visible without a panel.
      tone: failBias ? "bad" : "plain",
      hasRecord: true,
      accuracy,
      failBias,
    };
  }

  const n = `${rep.panelVerdicts} panel verdict${rep.panelVerdicts === 1 ? "" : "s"}`;
  // "Never outvoted" rather than "100%": on a healthy panel everybody agrees, so
  // a percentage would imply a precision this number does not have.
  const verdict =
    accuracy === 1
      ? "never outvoted"
      : `${Math.round(accuracy * 100)}% with the majority`;

  // Failing nearly everything is its own problem, separate from disagreeing:
  // a panel that all fails the same submission agrees perfectly while being
  // useless, so this is checked first.
  const tone: Tone = failBias
    ? "bad"
    : accuracy < OUTVOTED_MAJORITY
      ? "bad"
      : accuracy === 1
        ? "good"
        : "plain";

  return { summary: `${n} · ${verdict}`, tone, hasRecord: true, accuracy, failBias };
}
