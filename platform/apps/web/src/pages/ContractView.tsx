import { Link, useLocation, useParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Copy, Loader2, Lock } from "lucide-react";
import type { Contract } from "@repo/shared";
import { DELIVERABLE_TYPE_LABELS as TYPE_LABEL } from "@repo/shared";
import { CommitterSubmit } from "@/components/contract/CommitterSubmit";
import { PanelBoard } from "@/components/contract/PanelBoard";
import { VerifiedDownload } from "@/components/contract/VerifiedDownload";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api, prepareSignSubmit } from "@/lib/api";
import { useFees } from "@/lib/fees";
import { cn, short, usd } from "@/lib/utils";

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
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
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

  const me = publicKey?.toBase58();
  const isInitiator = me === c.initiator;
  const isCommitter = me === c.committer;
  const pastDeadline = Date.now() > new Date(c.deadline).getTime();

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

  const err = [accept, release, cancel, refund].find((m) => m.error)
    ?.error as Error | undefined;
  const busy =
    accept.isPending || release.isPending || cancel.isPending || refund.isPending;

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
          return <CommitterSubmit c={c} onDone={onDone} />;
        }
        if (isInitiator && pastDeadline) {
          return (
            <div>
              <div className="mb-3 text-sm text-st-submitted">
                Deadline passed with no deliverable — the committer ghosted.
              </div>
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
            Awaiting the committer&apos;s deliverable
            {isInitiator
              ? ` (until ${new Date(c.deadline).toLocaleDateString()})`
              : ""}
            .
          </Passive>
        );

      case "submitted":
        if (c.outcome === "pass") {
          if (isInitiator || isCommitter) {
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
          return <Passive ok>Verdict: PASS — awaiting release.</Passive>;
        }
        if (c.outcome === "fail") {
          if (isInitiator) {
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
          // Committer (and any other viewer): just the outcome, no action.
          return (
            <div className="flex items-center gap-2 text-sm text-st-submitted">
              <span className="size-2 rounded-full bg-st-submitted" /> Verdict: FAIL
            </div>
          );
        }
        return (
          <Passive>
            <span className="size-2 animate-pulse rounded-full bg-st-submitted" />
            {c.noMod
              ? "Submitted — settling."
              : "Awaiting verdict from the moderators."}
          </Passive>
        );

      case "settled":
        return (
          <div className="space-y-4">
            <Passive ok>Settled — funds released to the committer.</Passive>
            {isInitiator && c.deliverable && c.initiatorRecipient && (
              <VerifiedDownload c={c} />
            )}
          </div>
        );
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
  const { publicKey } = useWallet();

  const me = publicKey?.toBase58();
  const { fees } = useFees();
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
      <div className="flex justify-center py-20 text-muted">
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

  const isInitiator = me === contract.initiator;

  const totalCost = (
    BigInt(contract.amount) +
    BigInt(contract.protocolFee) +
    BigInt(contract.moderatorSurcharge)
  ).toString();
  const hasModFee = BigInt(contract.moderatorSurcharge) > 0n;

  return (
    <div className="mx-auto max-w-3xl">
      {!byLink && (
        <Link
          to="/contracts"
          className="mb-5 inline-flex items-center gap-2 text-sm text-muted transition hover:text-zinc-300"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
      )}

      <Card>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">{contract.title}</h1>
          <StatusPill status={contract.status} />
        </div>
        <p className="mt-3 text-zinc-400">{contract.brief}</p>

        <div className="mt-6 grid grid-cols-2 gap-5">
          <Field
            label={isInitiator ? "Total cost" : "Committer receives"}
            value={usd(isInitiator ? totalCost : contract.amount)}
            mono
          />
          <Field
            label="Deadline"
            value={new Date(contract.deadline).toLocaleDateString()}
          />
          <Field
            label="Type"
            value={TYPE_LABEL[contract.deliverableType] ?? contract.deliverableType}
          />
          <Field
            label="Judged by"
            value={
              contract.noMod
                ? "Nobody — no verification"
                : contract.panel.length > 1
                  ? `${contract.panel.length} moderators`
                  : (contract.panel[0]?.label ??
                    fees.moderators.find((m) => m.wallet === contract.moderator)?.label ??
                    (contract.moderator ? short(contract.moderator) : "Moderator"))
            }
          />
          {contract.committer && (
            <Field label="Committer" value={short(contract.committer)} mono />
          )}
        </div>

        {isInitiator && (
          <p className="mt-4 text-xs text-muted">
            {usd(contract.amount)} to the committer · {usd(contract.protocolFee)}{" "}
            protocol fee
            {hasModFee && <> · {usd(contract.moderatorSurcharge)} moderator fee</>}
          </p>
        )}

        {contract.panel.length > 0 && <PanelBoard c={contract} />}

        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted">
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

        {/* The initiator chose this and carries the risk, so warn them. For
            everyone else it's stated plainly in the fields above — visible if
            you look, but not an alarm aimed at the wrong person. */}
        {contract.noMod && publicKey?.toBase58() === contract.initiator && (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="text-amber-200">You skipped verification.</span>{" "}
              Nothing checks the deliverable against your criteria — submitting it
              pays out automatically, and there is no refund if the work is wrong.
            </span>
          </div>
        )}

        {contract.deliverable && (
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
              <Lock className="size-3.5" /> Deliverable — sealed to{" "}
              {contract.noMod ? "the initiator" : "the moderators"}
            </div>
            <div className="break-all font-mono text-xs text-muted">
              hash {short(contract.deliverable.deliverableHash)} · root{" "}
              {short(contract.deliverable.root)}
            </div>
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
