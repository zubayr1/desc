import type { ContractStatus } from "@repo/shared";

const META: Record<ContractStatus, { label: string; varName: string }> = {
  funded: { label: "Funded", varName: "--color-st-funded" },
  active: { label: "Active", varName: "--color-st-active" },
  submitted: { label: "Submitted", varName: "--color-st-submitted" },
  settled: { label: "Settled", varName: "--color-st-settled" },
  refunded: { label: "Refunded", varName: "--color-st-refunded" },
  cancelled: { label: "Cancelled", varName: "--color-st-cancelled" },
};

export function StatusPill({ status }: { status: ContractStatus }) {
  const m = META[status];
  const c = `var(${m.varName})`;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[0.7rem] font-medium uppercase tracking-wide"
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${c} 35%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      {m.label}
    </span>
  );
}
