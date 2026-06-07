import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { Contract } from "@repo/shared";
import { api, prepareSignSubmit } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn, short, usd } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  merged_pr: "Merged PR",
  deployed_contract: "Deployed contract",
  test_suite_pass: "Passing test suite",
  technical_report: "Technical report",
};

function Field({
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
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn("mt-1 text-sm text-zinc-200", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function Passive({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        ok ? "text-st-settled" : "text-zinc-400"
      )}
    >
      {ok && <Check className="size-4" />}
      {children}
    </div>
  );
}

/** The contextual action — depends on (status × role). */
function Actions({
  contract: c,
  onDone,
}: {
  contract: Contract;
  onDone: () => void;
}) {
  const { publicKey, connected, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [payload, setPayload] = useState("");

  const me = publicKey?.toBase58();
  const isInitiator = me === c.initiator;
  const isCommitter = me === c.committer;

  const accept = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/links/${c.linkToken}/accept/prepare`,
        `/links/${c.linkToken}/accept/submit`,
        { committer: me },
        signTransaction!
      ),
    onSuccess: onDone,
  });
  const submit = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/links/${c.linkToken}/deliverable/prepare`,
        `/links/${c.linkToken}/deliverable/submit`,
        { payload: payload.trim() },
        signTransaction!
      ),
    onSuccess: onDone,
  });
  const release = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/contracts/${c.id}/release/prepare`,
        `/contracts/${c.id}/release/submit`,
        { signer: me },
        signTransaction!
      ),
    onSuccess: onDone,
  });
  const cancel = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/contracts/${c.id}/cancel/prepare`,
        `/contracts/${c.id}/cancel/submit`,
        {},
        signTransaction!
      ),
    onSuccess: onDone,
  });
  const refund = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/contracts/${c.id}/refund/prepare`,
        `/contracts/${c.id}/refund/submit`,
        {},
        signTransaction!
      ),
    onSuccess: onDone,
  });

  if (!connected) {
    return (
      <Button variant="accent" className="w-full" onClick={() => setVisible(true)}>
        Connect wallet
      </Button>
    );
  }

  const err = [accept, submit, release, cancel, refund].find((m) => m.error)
    ?.error as Error | undefined;
  const busy =
    accept.isPending ||
    submit.isPending ||
    release.isPending ||
    cancel.isPending ||
    refund.isPending;

  const errorBox = err && (
    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
      {err.message}
    </div>
  );

  const spin = <Loader2 className="size-4 animate-spin" />;

  function body() {
    switch (c.status) {
      case "funded":
        if (isInitiator) {
          const link = `${window.location.origin}/c/${c.linkToken}`;
          return (
            <div>
              <div className="mb-3 text-sm text-zinc-400">
                Awaiting a committer. Share this link:
              </div>
              <div className="mb-4 flex items-center gap-2">
                <div className="glass flex-1 truncate px-3.5 py-2.5 font-mono text-sm text-zinc-300">
                  {link}
                </div>
                <Button
                  variant="outline"
                  className="px-3"
                  onClick={() => void navigator.clipboard.writeText(link)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? spin : "Cancel & reclaim deposit"}
              </Button>
            </div>
          );
        }
        return (
          <Button
            variant="accent"
            className="w-full"
            disabled={busy}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? spin : "Connect & accept this deal"}
          </Button>
        );

      case "active":
        if (isCommitter) {
          return (
            <div>
              <div className="mb-3 text-sm text-zinc-400">
                Submit your deliverable when it&apos;s ready.
              </div>
              <input
                className="inp mb-3 font-mono"
                placeholder="https://github.com/…/pull/42"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
              <Button
                variant="accent"
                className="w-full"
                disabled={busy || !payload.trim()}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? spin : "Submit deliverable"}
              </Button>
            </div>
          );
        }
        return <Passive>Awaiting the committer&apos;s deliverable.</Passive>;

      case "submitted":
        if (c.outcome === "pass" && (isInitiator || isCommitter)) {
          return (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-st-settled">
                <Check className="size-4" /> Verdict: PASS
              </div>
              <Button
                variant="accent"
                className="w-full"
                disabled={busy}
                onClick={() => release.mutate()}
              >
                {release.isPending ? spin : `Release ${usd(c.amount)} to committer`}
              </Button>
            </div>
          );
        }
        if (c.outcome === "fail" && isInitiator) {
          return (
            <div>
              <div className="mb-3 text-sm text-st-submitted">Verdict: FAIL</div>
              <Button
                variant="accent"
                className="w-full"
                disabled={busy}
                onClick={() => refund.mutate()}
              >
                {refund.isPending ? spin : "Reclaim deposit"}
              </Button>
            </div>
          );
        }
        return (
          <Passive>
            <span className="size-2 animate-pulse rounded-full bg-st-submitted" />
            Awaiting verdict from the moderators.
          </Passive>
        );

      case "settled":
        return <Passive ok>Settled — funds released to the committer.</Passive>;
      case "refunded":
        return <Passive>Refunded to the initiator.</Passive>;
      case "cancelled":
        return <Passive>Cancelled before acceptance.</Passive>;
    }
  }

  return (
    <>
      {errorBox}
      {body()}
    </>
  );
}

export function ContractView() {
  const { id = "" } = useParams();
  const byLink = useLocation().pathname.startsWith("/c/");
  const queryClient = useQueryClient();

  const queryKey = ["contract", byLink ? "link" : "id", id];
  const {
    data: contract,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<Contract>(byLink ? `/links/${id}` : `/contracts/${id}`),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (error || !contract) {
    return (
      <div className="mx-auto max-w-2xl text-center text-zinc-400">
        Contract not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {!byLink && (
        <Link
          to="/contracts"
          className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
      )}

      <Card>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{contract.title}</h1>
          <StatusPill status={contract.status} />
        </div>
        <p className="mt-3 text-zinc-400">{contract.brief}</p>

        <div className="mt-6 grid grid-cols-2 gap-5">
          <Field label="Pays" value={usd(contract.amount)} mono />
          <Field
            label="Deadline"
            value={new Date(contract.deadline).toLocaleDateString()}
          />
          <Field
            label="Type"
            value={TYPE_LABEL[contract.deliverableType] ?? contract.deliverableType}
          />
          {contract.committer && (
            <Field label="Committer" value={short(contract.committer)} mono />
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Acceptance criteria
          </div>
          <ul className="space-y-2">
            {contract.acceptanceCriteria.map((cr) => (
              <li
                key={cr.id}
                className="flex items-start gap-2 text-sm text-zinc-300"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-st-settled" />
                {cr.description}
              </li>
            ))}
          </ul>
        </div>

        {contract.deliverable && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
              Deliverable
            </div>
            <span className="inline-flex items-center gap-2 break-all font-mono text-sm text-accent-2">
              {contract.deliverable.payload} <ExternalLink className="size-3.5 shrink-0" />
            </span>
          </div>
        )}

        <div className="mt-7 border-t border-white/10 pt-6">
          <Actions
            contract={contract}
            onDone={() => queryClient.invalidateQueries({ queryKey })}
          />
        </div>
      </Card>
    </div>
  );
}
