import { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import {
  DELIVERABLE_TYPE_LABELS as TYPE_LABEL,
  type ContractPage,
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

/** Contracts per page — the server pages, the client only asks for one. */
const PAGE_SIZE = 5;

export function Dashboard() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [filter, setFilter] = useState<"all" | ContractStatus>("all");
  const [page, setPage] = useState(1);

  const address = publicKey?.toBase58();
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["contracts", address, filter, page],
    queryFn: () => {
      const q = new URLSearchParams({
        initiator: address!,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (filter !== "all") q.set("status", filter);
      return api.get<ContractPage>(`/contracts?${q}`);
    },
    enabled: connected && !!address,
    // keep showing the current page while the next one loads — no flash to a spinner
    placeholderData: keepPreviousData,
  });

  if (!connected) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">Connect your wallet</h1>
        <p className="mt-2 text-sm text-zinc-400">
          to see the contracts you&apos;ve created.
        </p>
        <Button variant="accent" className="mt-5" onClick={() => setVisible(true)}>
          Connect wallet
        </Button>
      </div>
    );
  }

  const list = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-semibold tracking-[-0.045em]">My contracts</h1>
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
            onClick={() => {
              setFilter(f);
              setPage(1); // a new filter has its own page count
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm capitalize transition",
              filter === f
                ? "border-accent/45 bg-accent/15 text-ink"
                : "border-white/[0.08] text-muted hover:text-ink"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20 text-muted">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {(error as Error).message}
        </div>
      ) : list.length === 0 ? (
        <div className="glass py-16 text-center">
          <p className="text-zinc-400">
            {filter !== "all" ? "No contracts in this filter." : "No contracts yet."}
          </p>
          <Link to="/new">
            <Button variant="outline" className="mt-4">
              <Plus className="size-4" /> Create your first
            </Button>
          </Link>
        </div>
      ) : (
        <div className={cn("space-y-3 transition-opacity", isFetching && "opacity-60")}>
          {list.map((c) => (
            <Link
              key={c.id}
              to={`/contracts/${c.id}`}
              className="glass glass-hover flex items-center gap-4 p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.title}</div>
                <div className="mt-1 text-sm text-muted">
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

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-3" aria-label="Pages">
              <span className="font-mono text-xs text-muted">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  className="px-2.5"
                  aria-label="Previous page"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: pages }, (_, i) => i + 1)
                  // first, last, and the neighbours of the current page
                  .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
                  .map((n, i, shown) => (
                    <span key={n} className="flex items-center gap-1.5">
                      {i > 0 && n - shown[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
                      <button
                        onClick={() => setPage(n)}
                        aria-current={n === page ? "page" : undefined}
                        className={cn(
                          "min-w-9 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                          n === page
                            ? "btn-accent text-white"
                            : "border border-white/[0.08] text-muted hover:bg-white/[0.05] hover:text-ink"
                        )}
                      >
                        {n}
                      </button>
                    </span>
                  ))}
                <Button
                  variant="outline"
                  className="px-2.5"
                  aria-label="Next page"
                  disabled={page >= pages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
