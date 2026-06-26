import { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import {
  DELIVERABLE_TYPE_LABELS as TYPE_LABEL,
  type Contract,
  type ContractStatus,
} from "@repo/shared";
import { api } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn, short, usd } from "@/lib/utils";

const FILTERS: Array<"all" | ContractStatus> = [
  "all",
  "funded",
  "active",
  "submitted",
  "settled",
];

export function Dashboard() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [filter, setFilter] = useState<"all" | ContractStatus>("all");

  const address = publicKey?.toBase58();
  const { data, isLoading, error } = useQuery({
    queryKey: ["contracts", address],
    queryFn: () => api.get<Contract[]>(`/contracts?initiator=${address}`),
    enabled: connected && !!address,
  });

  if (!connected) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold">Connect your wallet</h1>
        <p className="mt-2 text-sm text-zinc-400">
          to see the contracts you&apos;ve created.
        </p>
        <Button variant="accent" className="mt-5" onClick={() => setVisible(true)}>
          Connect wallet
        </Button>
      </div>
    );
  }

  const list = (data ?? []).filter(
    (c) => filter === "all" || c.status === filter
  );

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

      {isLoading ? (
        <div className="flex justify-center py-20 text-zinc-500">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {(error as Error).message}
        </div>
      ) : list.length === 0 ? (
        <div className="glass py-16 text-center">
          <p className="text-zinc-400">
            {data && data.length > 0
              ? "No contracts in this filter."
              : "No contracts yet."}
          </p>
          <Link to="/new">
            <Button variant="outline" className="mt-4">
              <Plus className="size-4" /> Create your first
            </Button>
          </Link>
        </div>
      ) : (
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
                  · {TYPE_LABEL[c.deliverableType] ?? c.deliverableType}
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
      )}
    </div>
  );
}
