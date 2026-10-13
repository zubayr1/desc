import { useState, type ReactNode } from "react";
import { Check, Info, Minus, MoreHorizontal, X } from "lucide-react";
import type { ModeratorOffer, RecentResult } from "@repo/shared";
import { reputationOf, TONE_CLASS } from "@/lib/reputation";
import { cn } from "@/lib/utils";

const SLOTS = 5;
const icon = "size-[9px] stroke-[3.5]";

const RESULT: Record<RecentResult, { label: string; short: string; dot: string; glyph: ReactNode }> = {
  majority: { label: "With the majority", short: "With the majority", dot: "bg-pass text-bg", glyph: <Check className={icon} /> },
  solo: { label: "Decided alone (panel of 1)", short: "Decided alone", dot: "border-[1.5px] border-pass text-pass", glyph: <Check className={icon} /> },
  minority: { label: "Outvoted", short: "Outvoted", dot: "bg-fail text-bg", glyph: <X className={icon} /> },
  split: { label: "Voted, but the panel couldn't decide", short: "No majority", dot: "border-[1.5px] border-zinc-500", glyph: null },
  silent: { label: "Didn't respond", short: "No response", dot: "bg-zinc-600 text-bg", glyph: <Minus className={icon} /> },
  mismatch: {
    label: "Revealed a different vote than it committed",
    short: "Vote didn't match",
    dot: "bg-fail text-bg",
    glyph: <span className="text-[10px] font-black leading-none">≠</span>,
  },
  withheld: {
    label: "Committed a hidden vote and never revealed it",
    short: "Vote never revealed",
    dot: "bg-fail text-bg",
    glyph: <span className="text-[9px] font-black leading-none">!</span>,
  },
};

export function ResultDot({ result, latest }: { result?: RecentResult; latest?: boolean }) {
  if (!result) {
    return <span className="size-3.5 shrink-0 rounded-full border border-dashed border-white/15" aria-hidden />;
  }
  const r = RESULT[result];
  return (
    <span
      title={r.label}
      aria-label={r.label}
      className={cn(
        "grid size-3.5 shrink-0 place-items-center rounded-full",
        r.dot,
        latest && "ring-[1.5px] ring-white/55 ring-offset-[1.5px] ring-offset-bg-soft"
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
      <span className="flex items-center gap-1">
        {slots.map((r, i) => (
          <ResultDot key={i} result={r} latest={!!r && i === SLOTS - 1} />
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-label="Show full record"
          className="ml-1 grid size-4 place-items-center rounded text-muted hover:bg-white/10 hover:text-ink"
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

function LegendItems() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.7rem] text-muted">
      {(Object.keys(RESULT) as RecentResult[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5" title={RESULT[k].label}>
          <ResultDot result={k} />
          {RESULT[k].short}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <ResultDot result="majority" latest />
        Most recent
      </span>
    </div>
  );
}

export function FormLegend({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-white/[0.07] bg-white/[0.02] p-3", className)}>
      <div className="label mb-2">Moderator form · last 5</div>
      <LegendItems />
    </div>
  );
}

/** An info icon that shows the legend in a bubble on hover, or on tap/focus. */
export function FormLegendTip() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="What do the circles mean?"
        className="grid size-4 place-items-center rounded-full text-muted outline-none hover:text-ink focus-visible:text-ink"
      >
        <Info className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className="invisible absolute -left-3 top-full z-30 mt-2.5 w-[320px] rounded-xl border border-white/10 bg-bg-soft p-3 text-left font-sans normal-case tracking-normal opacity-0 shadow-[0_18px_40px_-12px_rgba(0,0,0,.85)] transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="absolute -top-[7px] left-[15px] size-3 rotate-45 border-l border-t border-white/10 bg-bg-soft" />
        <span className="label mb-2 block">Moderator form · last 5</span>
        <LegendItems />
      </span>
    </span>
  );
}
