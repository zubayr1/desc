import type { Status } from "@/lib/mock";

const META: Record<Status, { label: string; varName: string }> = {
  funded: { label: "Funded", varName: "--color-st-funded" },
  active: { label: "Active", varName: "--color-st-active" },
  submitted: { label: "Submitted", varName: "--color-st-submitted" },
  settled: { label: "Settled", varName: "--color-st-settled" },
  refunded: { label: "Refunded", varName: "--color-st-refunded" },
  cancelled: { label: "Cancelled", varName: "--color-st-cancelled" },
};

export function StatusPill({ status }: { status: Status }) {
  const m = META[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-200">
      <span
        className="size-2 rounded-full"
        style={{
          background: `var(${m.varName})`,
          boxShadow: `0 0 8px var(${m.varName})`,
        }}
      />
      {m.label}
    </span>
  );
}
