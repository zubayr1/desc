import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Loader2, Plus, X } from "lucide-react";
import {
  DELIVERABLE_TYPES,
  type Contract,
  type CreateContractRequest,
  type DeliverableType,
} from "@repo/shared";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createAndFund } from "@/lib/api";

const TYPE_LABELS: Record<DeliverableType, string> = {
  merged_pr: "Merged PR",
  deployed_contract: "Deployed contract",
  test_suite_pass: "Passing test suite",
  technical_report: "Technical report",
};

// No AI moderators in the MVP (manual verdict), so no per-moderator surcharge
// yet. The V1 pricing (2% fee + per-moderator surcharge) returns with the AI.
const MODERATOR_COUNT = 0;

function FormField({ label, children }: { label: string; children: ReactNode }) {
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
  const { publicKey, connected, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [type, setType] = useState<DeliverableType>("merged_pr");
  const [criteria, setCriteria] = useState<string[]>([""]);
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [created, setCreated] = useState<Contract | null>(null);
  const [copied, setCopied] = useState(false);

  const amountNum = Number(amount) || 0;
  const fee = amountNum * 0.02;
  const total = amountNum + fee;

  const validCriteria = criteria.map((c) => c.trim()).filter(Boolean);
  const valid =
    title.trim() && brief.trim() && amountNum > 0 && deadline && validCriteria.length > 0;

  const createMut = useMutation({
    mutationFn: () => {
      const body: CreateContractRequest = {
        initiator: publicKey!.toBase58(),
        title: title.trim(),
        brief: brief.trim(),
        deliverableType: type,
        acceptanceCriteria: validCriteria.map((description) => ({ description })),
        amount: String(Math.round(amountNum * 1_000_000)),
        moderatorCount: MODERATOR_COUNT,
        moderatorSurcharge: "0",
        deadline: new Date(deadline).toISOString(),
      };
      return createAndFund(body, signTransaction!);
    },
    onSuccess: setCreated,
  });

  // ── Success state ──────────────────────────────────────────────
  if (created) {
    const link = `${window.location.origin}/c/${created.linkToken}`;
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <div className="flex items-center gap-2 text-st-settled">
            <Check className="size-5" />
            <h1 className="text-xl font-semibold">Contract funded</h1>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            Send this link to your committer — they review the terms, connect a
            wallet, and accept.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <div className="glass flex-1 truncate px-3.5 py-2.5 font-mono text-sm text-zinc-300">
              {link}
            </div>
            <Button
              variant="outline"
              className="px-3"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <Link to={`/contracts/${created.id}`}>
            <Button variant="accent" className="mt-5 w-full">
              View contract <ArrowRight className="size-4" />
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New contract</h1>

      <Card className="space-y-5">
        <FormField label="Title">
          <input
            className="inp"
            placeholder="Implement token vesting program"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>

        <FormField label="Brief">
          <textarea
            rows={3}
            className="inp resize-none"
            placeholder="Describe the work and what 'done' looks like…"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </FormField>

        <FormField label="Deliverable type">
          <select
            className="inp"
            value={type}
            onChange={(e) => setType(e.target.value as DeliverableType)}
          >
            {DELIVERABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Acceptance criteria">
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="inp"
                  placeholder="e.g. PR merged into main"
                  value={c}
                  onChange={(e) =>
                    setCriteria((cs) =>
                      cs.map((x, j) => (j === i ? e.target.value : x))
                    )
                  }
                />
                {criteria.length > 1 && (
                  <button
                    onClick={() =>
                      setCriteria((cs) => cs.filter((_, j) => j !== i))
                    }
                    className="text-zinc-600 hover:text-zinc-300"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setCriteria((cs) => [...cs, ""])}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
            >
              <Plus className="size-4" /> add criterion
            </button>
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Amount (USDC)">
            <input
              className="inp"
              inputMode="decimal"
              placeholder="1000"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                // digits with an optional single decimal point only
                if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
              }}
            />
          </FormField>
          <FormField label="Deadline">
            <input
              type="date"
              className="inp"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </FormField>
        </div>

        <div className="glass flex items-center justify-between p-4 text-sm">
          <span className="text-zinc-400">
            You pay <span className="text-zinc-200">{amountNum || 0}</span> +{" "}
            {fee.toFixed(2)} protocol fee
          </span>
          <span className="font-mono text-base font-semibold">
            {total.toLocaleString()} USDC
          </span>
        </div>

        {createMut.error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
            {createMut.error.message}
          </div>
        )}

        {!connected ? (
          <Button variant="accent" className="w-full" onClick={() => setVisible(true)}>
            Connect wallet to continue
          </Button>
        ) : (
          <Button
            variant="accent"
            className="w-full"
            disabled={!valid || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Funding…
              </>
            ) : (
              "Fund & create"
            )}
          </Button>
        )}
      </Card>
    </div>
  );
}
