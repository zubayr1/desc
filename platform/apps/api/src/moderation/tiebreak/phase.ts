import { VOTE_FAIL, VOTE_PASS } from "../commit";

const DEFAULT_WINDOW = 3_600;

type Num = { toNumber(): number };

export interface EscrowTimes {
  outcome: unknown;
  verdictWindow: Num;
  revealDeadline: Num;
}

export interface PanelVotes {
  count: number;
  tiebreakFills: number;
  entries: { vote: number }[];
}

/** Mirrors `record_tiebreak` and `finalize`: what the chain accepts right now. */
export function tiebreakPhase(esc: EscrowTimes, panel: PanelVotes, now: number): "none" | "tiebreak" | "finalize" {
  const revealEnd = esc.revealDeadline.toNumber();
  if (esc.outcome || panel.count === 0 || now <= revealEnd) return "none";

  const cap = panel.count === 1 ? 1 : panel.count - 1;
  const window = esc.verdictWindow.toNumber() > 0 ? esc.verdictWindow.toNumber() : DEFAULT_WINDOW;
  const silent = panel.entries.slice(0, panel.count).some((e) => e.vote !== VOTE_PASS && e.vote !== VOTE_FAIL);
  const expired = now > revealEnd + window * cap;
  return panel.tiebreakFills >= cap || !silent || expired ? "finalize" : "tiebreak";
}
