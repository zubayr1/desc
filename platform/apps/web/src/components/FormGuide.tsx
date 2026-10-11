import { useState, type ReactNode } from "react";
import { Check, Minus, MoreHorizontal, X } from "lucide-react";
import type { ModeratorOffer, RecentResult } from "@repo/shared";
import { reputationOf, TONE_CLASS } from "@/lib/reputation";
import { cn } from "@/lib/utils";

const SLOTS = 5;
const icon = "size-[11px] stroke-[3.5]";

const RESULT: Record<RecentResult, { label: string; dot: string; glyph: ReactNode }> = {
  majority: { label: "With the majority", dot: "bg-pass text-bg", glyph: <Check className={icon} /> },
  solo: { label: "Decided alone (panel of 1)", dot: "border-2 border-pass text-pass", glyph: <Check className={icon} /> },
  minority: { label: "Outvoted", dot: "bg-fail text-bg", glyph: <X className={icon} /> },
  split: { label: "Voted, but the panel couldn't decide", dot: "border-2 border-zinc-500", glyph: null },
  silent: { label: "Didn't respond", dot: "bg-zinc-600 text-bg", glyph: <Minus className={icon} /> },
  withheld: {
    label: "Committed a hidden vote and never revealed it",
    dot: "bg-fail text-bg",
    glyph: <span className="text-[11px] font-black leading-none">!</span>,
  },
};

export function ResultDot({ result, latest }: { result?: RecentResult; latest?: boolean }) {
  if (!result) {
    return <span className="size-[18px] rounded-full border border-dashed border-white/15" aria-hidden />;
  }
  const r = RESULT[result];
  return (
    <span
      title={r.label}
      aria-label={r.label}
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full",
        r.dot,
        latest && "ring-2 ring-white/55 ring-offset-2 ring-offset-bg-soft"
      )}
    >
      {r.glyph}
    </span>
  );
}

/** A moderator's last 5 results, oldest to newest, and its full record behind "…". */
export function FormGuide({ m }: { m: ModeratorOffer }) {
  const [open, setOpen] = useState(false);
  const rep = reputationOf(m);
  const recent = m.recent ?? [];

  if (!rep.hasRecord && recent.length === 0) {
    return <span className="text-[0.7rem] text-zinc-600">no record yet</span>;
  }

  const shown = recent.slice(0, SLOTS).reverse();
  const slots = [...Array(SLOTS - shown.length).fill(undefined), ...shown] as (RecentResult | undefined)[];

  return (
    <span className="block">
      <span className="flex items-center gap-1.5">
        {slots.map((r, i) => (
          <ResultDot key={i} result={r} latest={!!r && i === SLOTS - 1} />
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-label="Show full record"
          className="ml-1 grid size-[18px] place-items-center rounded-md text-muted hover:bg-white/10 hover:text-ink"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </span>
      {open && <span className={cn("mt-1 block text-[0.7rem]", TONE_CLASS[rep.tone])}>{rep.totals}</span>}
      {rep.failBias && <span className="mt-1 block text-[0.7rem] text-fail">fails nearly everything it judges</span>}
    </span>
  );
}

export function FormLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted", className)}>
      {(Object.keys(RESULT) as RecentResult[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <ResultDot result={k} />
          {RESULT[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <ResultDot result="majority" latest />
        Ringed: the most recent
      </span>
    </div>
  );
}
