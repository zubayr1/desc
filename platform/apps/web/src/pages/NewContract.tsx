import type { ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

export function NewContract() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New contract</h1>

      <Card className="space-y-5">
        <Field label="Title">
          <input className="inp" placeholder="Implement token vesting program" />
        </Field>

        <Field label="Brief">
          <textarea
            rows={3}
            className="inp resize-none"
            placeholder="Describe the work and what 'done' looks like…"
          />
        </Field>

        <Field label="Deliverable type">
          <select className="inp">
            <option>Merged PR</option>
            <option>Deployed contract</option>
            <option>Passing test suite</option>
            <option>Technical report</option>
          </select>
        </Field>

        <Field label="Acceptance criteria">
          <div className="space-y-2">
            {["PR merged into main", "All tests pass in CI"].map((c) => (
              <div
                key={c}
                className="glass flex items-center gap-2.5 px-3 py-2.5 text-sm"
              >
                <Check className="size-4 shrink-0 text-st-settled" />
                <span className="flex-1">{c}</span>
                <X className="size-4 cursor-pointer text-zinc-600 hover:text-zinc-300" />
              </div>
            ))}
            <button className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
              <Plus className="size-4" /> add criterion
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (USDC)">
            <input className="inp" placeholder="1000" />
          </Field>
          <Field label="Deadline">
            <input className="inp" placeholder="2026-06-20" />
          </Field>
        </div>

        <div className="glass flex items-center justify-between p-4 text-sm">
          <span className="text-zinc-400">
            You pay <span className="text-zinc-200">1000</span> + 20 fee + 30
            moderators
          </span>
          <span className="font-mono text-base font-semibold">1050 USDC</span>
        </div>

        <Button variant="accent" className="w-full">
          Fund &amp; create
        </Button>
      </Card>
    </div>
  );
}
