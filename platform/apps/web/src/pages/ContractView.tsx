import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";
import { findContract, type MockContract } from "@/lib/mock";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn("mt-1 text-sm text-zinc-200", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

/** The contextual action — swaps by status (× role, in the real app). */
function Action({ c }: { c: MockContract }) {
  switch (c.status) {
    case "funded":
      return (
        <div>
          <div className="mb-3 text-sm text-zinc-400">
            Awaiting a committer. Share this link:
          </div>
          <div className="flex items-center gap-2">
            <div className="glass flex-1 truncate px-3.5 py-2.5 font-mono text-sm text-zinc-300">
              desc.app/c/{c.linkToken}
            </div>
            <Button variant="outline" className="px-3">
              <Copy className="size-4" />
            </Button>
          </div>
          <div className="my-4 text-center text-xs text-zinc-600">
            — or, if you&apos;re the committer —
          </div>
          <Button variant="accent" className="w-full">
            Connect wallet &amp; accept
          </Button>
        </div>
      );
    case "active":
      return (
        <div>
          <div className="mb-3 text-sm text-zinc-400">
            Submit your deliverable when it&apos;s ready.
          </div>
          <input
            className="inp mb-3 font-mono"
            placeholder="https://github.com/…/pull/42"
          />
          <Button variant="accent" className="w-full">
            Submit deliverable
          </Button>
        </div>
      );
    case "submitted":
      return c.outcome === "pass" ? (
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-st-settled">
            <Check className="size-4" /> Verdict: PASS — funds are yours to claim.
          </div>
          <Button variant="accent" className="w-full">
            Claim {usd(c.amount)}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-st-submitted">
          <span className="size-2 animate-pulse rounded-full bg-st-submitted" />
          Awaiting verdict from the moderators.
        </div>
      );
    case "settled":
      return (
        <div className="flex items-center gap-2 text-sm text-st-settled">
          <Check className="size-4" /> Settled — funds released to the committer.
        </div>
      );
    case "refunded":
      return (
        <div className="text-sm text-zinc-400">Refunded to the initiator.</div>
      );
    case "cancelled":
      return (
        <div className="text-sm text-zinc-400">
          Cancelled before acceptance.
        </div>
      );
  }
}

export function ContractView() {
  const { id } = useParams();
  const c = findContract(id ?? "");

  if (!c) {
    return <div className="text-zinc-400">Contract not found.</div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/contracts"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <StatusPill status={c.status} />
        </div>
        <p className="mt-3 text-zinc-400">{c.brief}</p>

        <div className="mt-6 grid grid-cols-2 gap-5">
          <Field label="Pays" value={usd(c.amount)} mono />
          <Field label="Deadline" value={c.deadline} />
          <Field label="Type" value={c.deliverableType} />
          {c.committer && (
            <Field label="Committer" value={short(c.committer)} mono />
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Acceptance criteria
          </div>
          <ul className="space-y-2">
            {c.criteria.map((cr) => (
              <li
                key={cr}
                className="flex items-start gap-2 text-sm text-zinc-300"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-st-settled" />
                {cr}
              </li>
            ))}
          </ul>
        </div>

        {c.deliverable && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
              Deliverable
            </div>
            <span className="inline-flex items-center gap-2 font-mono text-sm text-accent-2">
              {c.deliverable} <ExternalLink className="size-3.5" />
            </span>
          </div>
        )}

        <div className="mt-7 border-t border-white/10 pt-6">
          <Action c={c} />
        </div>
      </Card>
    </div>
  );
}
