import type { VerdictTiming } from "@repo/shared";
import { VOTE_COMMITTED, VOTE_FAIL, VOTE_MISMATCH, VOTE_NONE, VOTE_PASS } from "../commit";

const DEFAULT_WINDOW = 3_600;

type Num = { toNumber(): number };

export interface EscrowTimes {
  outcome: unknown;
  verdictWindow: Num;
  commitDeadline: Num;
  revealDeadline: Num;
}

export interface PanelVotes {
  count: number;
  tiebreakFills: number;
  entries: { vote: number }[];
}

const cast = (vote: number) => vote === VOTE_PASS || vote === VOTE_FAIL;

/** Mirrors `Escrow::tiebreak_open`: voting closed, or no seat can still change the tally. */
export function tiebreakOpen(esc: EscrowTimes, panel: PanelVotes, now: number): boolean {
  if (now > esc.revealDeadline.toNumber()) return true;
  return panel.entries
    .slice(0, panel.count)
    .every((e) => cast(e.vote) || e.vote === VOTE_MISMATCH || (e.vote === VOTE_NONE && now > esc.commitDeadline.toNumber()));
}

/** Mirrors `record_tiebreak` and `finalize`: what the chain accepts right now. */
export function tiebreakPhase(esc: EscrowTimes, panel: PanelVotes, now: number): "none" | "tiebreak" | "finalize" {
  if (esc.outcome || panel.count === 0 || !tiebreakOpen(esc, panel, now)) return "none";

  const silent = panel.entries.slice(0, panel.count).some((e) => !cast(e.vote));
  const expired = now > tiebreakDeadline(esc, panel);
  return panel.tiebreakFills >= cap(panel) || !silent || expired ? "finalize" : "tiebreak";
}

const cap = (panel: PanelVotes) => (panel.count === 1 ? 1 : panel.count - 1);

function tiebreakDeadline(esc: EscrowTimes, panel: PanelVotes): number {
  const window = esc.verdictWindow.toNumber() > 0 ? esc.verdictWindow.toNumber() : DEFAULT_WINDOW;
  return esc.revealDeadline.toNumber() + window * cap(panel);
}

/** The phase a submitted contract's verdict is in, for display. */
export function verdictTiming(esc: EscrowTimes, panel: PanelVotes, now: number): VerdictTiming | null {
  if (panel.count === 0) return null;
  const at = (t: number) => new Date(Date.now() + (t - now) * 1000).toISOString();
  const seats = panel.entries.slice(0, panel.count);
  const revealEnd = esc.revealDeadline.toNumber();

  if (esc.outcome) {
    const unrevealed = seats.some((e) => e.vote === VOTE_COMMITTED);
    return unrevealed && now <= revealEnd ? { phase: "awaiting-reveals", endsAt: at(revealEnd) } : null;
  }
  if (!tiebreakOpen(esc, panel, now)) {
    if (panel.count === 1) return { phase: "vote", endsAt: at(revealEnd) };
    const commitEnd = esc.commitDeadline.toNumber();
    const revealing = seats.every((e) => e.vote !== VOTE_NONE) || now > commitEnd;
    return revealing ? { phase: "reveal", endsAt: at(revealEnd) } : { phase: "commit", endsAt: at(commitEnd) };
  }
  const phase = tiebreakPhase(esc, panel, now);
  if (phase === "tiebreak") return { phase: "tiebreak", endsAt: at(tiebreakDeadline(esc, panel)) };
  return phase === "finalize" ? { phase: "finalizable", endsAt: null } : null;
}
