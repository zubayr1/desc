import type { Contract, SeatVote } from "@repo/shared";
import { cn, short, usd } from "@/lib/utils";

/**
 * The panel and how it voted.
 *
 * Votes are read live from the on-chain panel, so they appear one at a time as
 * the moderators finish, and the api caches them — the panel account is closed
 * on settle to return its rent, so without the cache a settled contract could
 * only ever show its final outcome.
 *
 * `vote === undefined` means never read, not "did not vote"; an unvoted seat
 * reads `null`.
 */
export function PanelBoard({ c }: { c: Contract }) {
  const seats = c.panel;
  const known = seats.filter((m) => m.vote !== undefined);
  const agreeing = c.outcome ? known.filter((m) => m.vote === c.outcome).length : 0;
  // "2 of 3 agreed" is only honest while the votes are still readable.
  const closed = !!c.outcome || c.verdict?.phase === "tiebreak" || c.verdict?.phase === "finalizable";
  const result =
    c.outcome === "inconclusive"
      ? "NO MAJORITY — INCONCLUSIVE"
      : c.outcome && known.length
      ? `${agreeing} of ${seats.length} agreed — ${c.outcome.toUpperCase()}`
      : c.outcome
        ? c.outcome.toUpperCase()
        : null;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-wider text-muted">
          {seats.length > 1 ? `Panel · ${seats.length} moderators` : "Moderator"}
        </span>
        {result && (
          <span
            className={cn(
              "text-xs font-semibold",
              c.outcome === "pass" ? "text-pass" : c.outcome === "fail" ? "text-fail" : "text-muted"
            )}
          >
            {result}
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {seats.map((m) => (
          <li
            key={m.wallet}
            className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {m.filledBy ? (m.filledByLabel ?? "Tiebreaker") : m.label}
              </span>
              <span className="block truncate font-mono text-[0.68rem] text-muted">
                {m.filledBy ? `for ${m.label} · ${short(m.filledBy)}` : short(m.wallet)} · {usd(m.fee)}
              </span>
            </span>
            <VoteBadge vote={m.vote} closed={closed} />
          </li>
        ))}
      </ul>
      {seats
        .filter((m) => m.filledBy)
        .map((m) => (
          <p key={m.wallet} className="mt-2 text-xs text-st-submitted">
            {m.label} didn&apos;t vote in time — {m.filledByLabel ?? "a platform tiebreaker"} took its seat
            {m.vote === "pass" || m.vote === "fail" ? ` and voted ${m.vote.toUpperCase()}` : ""}.
          </p>
        ))}
      {seats.length > 1 && (
        <p className="mt-2 text-xs text-muted">
          Each moderator judges on its own and is paid its own price — the fees are
          summed, not split. A majority settles the contract; if voting closes
          without one, a platform tiebreaker takes a silent seat.
        </p>
      )}
    </div>
  );
}

function VoteBadge({ vote, closed }: { vote?: SeatVote | null; closed: boolean }) {
  if (vote === undefined) {
    return <span className="font-mono text-[0.68rem] text-muted">—</span>;
  }
  if (vote === "committed") {
    return <span className="font-mono text-[0.68rem] text-muted">voted · hidden</span>;
  }
  if (vote === null && closed) {
    return <span className="font-mono text-[0.68rem] text-muted">silent</span>;
  }
  if (vote === null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-muted">
        <span className="size-1.5 animate-pulse rounded-full bg-st-submitted" />
        judging
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[0.68rem] font-semibold",
        vote === "pass" ? "bg-pass/15 text-pass" : "bg-fail/15 text-fail"
      )}
    >
      {vote.toUpperCase()}
    </span>
  );
}
