import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { ModeratorOffer } from "@repo/shared";
import { cn } from "@/lib/utils";

/**
 * Choose who judges the work. Built for many moderators and for choosing
 * several — chosen ones show as tokens, the list is searchable and sortable.
 *
 * `sizes` are the panel sizes the program accepts — `[1, 3]` for a real
 * contract, since an even panel cannot reach a majority. The largest is the cap:
 * picking beyond it replaces the oldest choice, which with `[1]` makes this a
 * radio. Sizes in between are selectable but invalid, and the caller is expected
 * to say so and block submission — stopping the click that takes you from 1 to 2
 * would make three moderators unreachable.
 */
export function ModeratorPicker({
  moderators,
  selected,
  onChange,
  sizes = [1],
  amount,
}: {
  moderators: ModeratorOffer[];
  selected: string[];
  onChange: (wallets: string[]) => void;
  /** Panel sizes the program accepts, ascending. Defaults to one moderator. */
  sizes?: number[];
  /** Contract amount in USDC, to show each moderator's fee in money too. */
  amount: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const max = Math.max(...sizes);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return moderators
      .filter((m) => !q || m.label.toLowerCase().includes(q) || m.wallet.toLowerCase().includes(q))
      .sort((a, b) => a.baseBps - b.baseBps);
  }, [moderators, query]);

  const chosen = moderators.filter((m) => selected.includes(m.wallet));

  const toggle = (wallet: string) => {
    if (selected.includes(wallet)) return onChange(selected.filter((w) => w !== wallet));
    // At the cap, a new pick replaces the oldest — with max=1 that is a radio.
    onChange([...selected, wallet].slice(-max));
    if (max === 1) setOpen(false);
  };

  const fee = (bps: number) => (amount > 0 ? `${((amount * bps) / 10_000).toFixed(2)} USDC` : `${(bps / 100).toFixed(2)}%`);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex min-h-[3.1rem] flex-wrap items-center gap-2 rounded-xl border bg-black/35 p-1.5 transition",
          open ? "border-accent/60 shadow-[0_0_0_4px_rgba(139,92,255,.12)]" : "border-white/[0.08]"
        )}
      >
        {chosen.length === 0 && <span className="px-2 text-sm text-zinc-500">Choose who judges the work</span>}
        {chosen.map((m) => (
          <span key={m.wallet} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/5 py-1 pl-1 pr-1.5 text-sm font-medium">
            <Avatar label={m.label} small />
            {m.label}
            <span className="font-mono text-xs text-muted">{(m.baseBps / 100).toFixed(2)}%</span>
            <button
              type="button"
              aria-label={`Remove ${m.label}`}
              className="grid size-5 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-ink"
              onClick={() => toggle(m.wallet)}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-expanded={open}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-dashed border-accent/45 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-lilac"
          onClick={() => setOpen((o) => !o)}
        >
          {chosen.length ? "Change" : "Choose"} <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-bg-soft/95 shadow-[0_24px_60px_-24px_rgba(0,0,0,.8)] backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/[0.07] p-2.5">
            <Search className="ml-1 size-4 text-muted" />
            <input
              id="moderator-search"
              autoFocus
              className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-zinc-600"
              placeholder="Search by name or wallet"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="whitespace-nowrap font-mono text-[0.68rem] text-muted">by price</span>
          </div>
          <ul role="listbox" aria-multiselectable={max > 1} className="max-h-64 overflow-y-auto p-1.5">
            {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No moderator matches.</li>}
            {list.map((m) => {
              const on = selected.includes(m.wallet);
              return (
                <li key={m.wallet} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(m.wallet)}
                    className={cn(
                      "grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                      on ? "bg-accent/10" : "hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-[18px] place-items-center rounded-[5px] border text-[0.65rem] font-bold",
                        on ? "border-accent bg-accent text-white" : "border-white/20 text-transparent"
                      )}
                    >
                      ✓
                    </span>
                    <Avatar label={m.label} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{m.label}</span>
                        {m.test && (
                          <span className="shrink-0 rounded bg-fail/15 px-1 py-px text-[0.6rem] font-semibold uppercase text-fail">
                            test
                          </span>
                        )}
                      </span>
                      <span className="block truncate font-mono text-[0.7rem] text-muted">
                        {m.wallet.slice(0, 4)}…{m.wallet.slice(-4)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tracking-[-0.02em]">{(m.baseBps / 100).toFixed(2)}%</span>
                      {amount > 0 && <span className="block font-mono text-[0.68rem] text-muted">{fee(m.baseBps)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-white/[0.07] px-3 py-2 font-mono text-[0.68rem] text-muted">
            {sizes.length === 1
              ? `${sizes[0]} moderator${sizes[0] === 1 ? "" : "s"} per contract`
              : `Choose ${sizes.slice(0, -1).join(", ")} or ${sizes.at(-1)}`}{" "}
            · each is paid its own price, read on-chain
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ label, small }: { label: string; small?: boolean }) {
  const letter = label.replace(/^mod\s*/i, "").slice(0, 1).toUpperCase() || "M";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-accent/35 to-accent-2/25 font-mono font-semibold",
        small ? "size-6 text-[0.68rem]" : "size-8 text-xs"
      )}
    >
      {letter}
    </span>
  );
}
