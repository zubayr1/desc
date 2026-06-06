import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { MOCK, type Status } from "@/lib/mock";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn, short, usd } from "@/lib/utils";

const FILTERS: Array<"all" | Status> = [
  "all",
  "funded",
  "active",
  "submitted",
  "settled",
];

export function Dashboard() {
  const [filter, setFilter] = useState<"all" | Status>("all");
  const list = MOCK.filter((c) => filter === "all" || c.status === filter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My contracts</h1>
        <Link to="/new">
          <Button variant="accent">
            <Plus className="size-4" /> New
          </Button>
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm capitalize transition",
              filter === f
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/10 text-zinc-400 hover:text-zinc-200"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((c) => (
          <Link
            key={c.id}
            to={`/contracts/${c.id}`}
            className="glass glass-hover flex items-center gap-4 p-5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.title}</div>
              <div className="mt-1 text-sm text-zinc-500">
                {c.committer ? (
                  <>
                    committer{" "}
                    <span className="font-mono text-zinc-400">
                      {short(c.committer)}
                    </span>
                  </>
                ) : (
                  "awaiting committer"
                )}{" "}
                · {c.deliverableType}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm">{usd(c.amount)}</div>
              <div className="mt-1.5">
                <StatusPill status={c.status} />
              </div>
            </div>
            <ChevronRight className="size-5 shrink-0 text-zinc-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
