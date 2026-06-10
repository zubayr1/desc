import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, LogOut, RefreshCw, X } from "lucide-react";
import type { Contract } from "@repo/shared";
import { api, clearToken, getToken, setToken } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn, externalHref, short, usd } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  merged_pr: "Merged PR",
  deployed_contract: "Deployed contract",
  test_suite_pass: "Passing test suite",
  technical_report: "Technical report",
};

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

/** A submitted contract awaiting a verdict — the actionable unit. */
function VerdictCard({ c, onDone }: { c: Contract; onDone: () => void }) {
  const [note, setNote] = useState("");
  const verdict = useMutation({
    mutationFn: (outcome: "pass" | "fail") =>
      api.post(`/admin/contracts/${c.id}/verdict`, {
        outcome,
        note: note.trim() || undefined,
      }),
    onSuccess: onDone,
  });
  const pending = verdict.isPending;

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
          <a
            href={externalHref(c.deliverable.payload)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-2 break-all font-mono text-sm text-accent-2 hover:underline"
          >
            {c.deliverable.payload} <ExternalLink className="size-3.5 shrink-0" />
          </a>
        ) : (
          <div className="mt-1 text-sm text-zinc-500">none submitted</div>
        )}
      </div>

      <input
        className="inp mt-5"
        placeholder="Verdict note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {verdict.error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          {(verdict.error as Error).message}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <Button
          variant="accent"
          className="flex-1"
          disabled={pending}
          onClick={() => verdict.mutate("pass")}
        >
          {pending && verdict.variables === "pass" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Pass
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          disabled={pending}
          onClick={() => verdict.mutate("fail")}
        >
          {pending && verdict.variables === "fail" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
          Fail
        </Button>
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
            <span className="text-gradient">desc</span> · moderator console
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Record verdicts on submitted deliverables — signed server-side by the
            settlement authority.
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
                  <VerdictCard key={c.id} c={c} onDone={refresh} />
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
          <span className="text-gradient">desc</span> · moderator
        </h1>
        <p className="mb-4 mt-1 text-sm text-zinc-500">
          Enter the admin token to continue.
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
            placeholder="Admin token"
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
