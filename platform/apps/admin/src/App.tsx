import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import { DELIVERABLE_TYPE_LABELS as TYPE_LABEL, type Contract } from "@repo/shared";
import { api, clearToken, getToken, setToken } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn, short, usd } from "@/lib/utils";


function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-wider text-zinc-500">{children}</div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className={cn("mt-0.5 text-zinc-200", mono && "font-mono text-[13px]")}>
        {value}
      </div>
    </div>
  );
}

/** A submitted contract awaiting a moderator verdict — read-only oversight. */
function SubmittedCard({ c }: { c: Contract }) {
  return (
    <div className="glass p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{c.title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{c.brief}</p>
        </div>
        <StatusPill status={c.status} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta label="Pays" value={usd(c.amount)} />
        <Meta
          label="Type"
          value={TYPE_LABEL[c.deliverableType] ?? c.deliverableType}
        />
        <Meta label="Initiator" value={short(c.initiator)} mono />
        <Meta label="Committer" value={c.committer ? short(c.committer) : "—"} mono />
      </div>

      <div className="mt-5">
        <Label>Acceptance criteria</Label>
        <ul className="mt-1.5 space-y-1">
          {c.acceptanceCriteria.map((cr) => (
            <li key={cr.id} className="flex gap-2 text-sm text-zinc-300">
              <span className="text-zinc-600">•</span> {cr.description}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <Label>Deliverable</Label>
        {c.deliverable ? (
          <div className="mt-1 text-sm text-zinc-400">
            🔒 sealed — only the moderator agents can decrypt + judge it.
            <div className="mt-1 break-all font-mono text-xs text-zinc-500">
              hash {short(c.deliverable.deliverableHash)} · root {short(c.deliverable.root)}
            </div>
          </div>
        ) : (
          <div className="mt-1 text-sm text-zinc-500">none submitted</div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 text-sm text-st-submitted">
        <span className="size-2 animate-pulse rounded-full bg-st-submitted" />
        Awaiting moderator verdict
      </div>
    </div>
  );
}

/** Compact read-only row for contracts not awaiting a verdict. */
function Row({ c }: { c: Contract }) {
  return (
    <div className="glass flex items-center gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{c.title}</div>
        <div className="mt-0.5 text-xs text-zinc-500">
          <span className="font-mono">{short(c.initiator)}</span> →{" "}
          <span className="font-mono">
            {c.committer ? short(c.committer) : "—"}
          </span>{" "}
          · {usd(c.amount)}
          {c.outcome ? ` · verdict ${c.outcome}` : ""}
        </div>
      </div>
      <StatusPill status={c.status} />
    </div>
  );
}

function Console({ onSignOut }: { onSignOut: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["admin-contracts"],
    queryFn: () => api.get<Contract[]>("/admin/contracts"),
    refetchInterval: 10_000,
  });
  // A 401 clears the token in api — bounce back to the login screen.
  useEffect(() => {
    if (error instanceof Error && error.message === "Unauthorized") onSignOut();
  }, [error, onSignOut]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-contracts"] });

  const all = data ?? [];
  const queue = all.filter((c) => c.status === "submitted" && !c.outcome);
  const rest = all.filter((c) => !(c.status === "submitted" && !c.outcome));

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="text-gradient">desc</span> · platform oversight
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Read-only view of all contracts. Verdicts are produced by the moderator
            agents — the platform doesn&apos;t judge or decrypt.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="ghost" onClick={onSignOut} title="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20 text-zinc-500">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {(error as Error).message}
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-zinc-400">
              Awaiting verdict
              {queue.length > 0 && (
                <span className="rounded-full bg-st-submitted/20 px-2 py-0.5 text-xs normal-case text-st-submitted">
                  {queue.length}
                </span>
              )}
            </h2>
            {queue.length === 0 ? (
              <div className="glass px-5 py-10 text-center text-sm text-zinc-500">
                Nothing awaiting a verdict.
              </div>
            ) : (
              <div className="space-y-4">
                {queue.map((c) => (
                  <SubmittedCard key={c.id} c={c} />
                ))}
              </div>
            )}
          </section>

          {rest.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">
                All contracts
              </h2>
              <div className="space-y-2">
                {rest.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Login({ onAuth }: { onAuth: (t: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mx-auto max-w-sm px-5 py-24">
      <div className="glass p-6">
        <h1 className="text-lg font-semibold">
          <span className="text-gradient">desc</span> · platform
        </h1>
        <p className="mb-4 mt-1 text-sm text-zinc-500">
          Enter the platform token to continue.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onAuth(value.trim());
          }}
        >
          <input
            className="inp"
            type="password"
            placeholder="Platform token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <Button
            variant="accent"
            type="submit"
            className="mt-3 w-full"
            disabled={!value.trim()}
          >
            Enter console
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  if (!token) {
    return (
      <Login
        onAuth={(t) => {
          setToken(t);
          setTokenState(t);
        }}
      />
    );
  }
  return (
    <Console
      onSignOut={() => {
        clearToken();
        setTokenState(null);
      }}
    />
  );
}
