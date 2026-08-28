import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, Copy, Loader2, Plus, X } from "lucide-react";
import {
  DELIVERABLE_TYPES,
  DELIVERABLE_TYPE_LABELS as TYPE_LABELS,
  DELIVERABLE_TYPE_HINTS as TYPE_HINTS,
  DEFAULT_PROTOCOL_FEE_BPS,
  DEFAULT_PROTOCOL_FEE_MIN,
  DEFAULT_MIN_AMOUNT,
  MODERATOR_SURCHARGE_BPS,
  MODERATOR_COUNT,
  type Contract,
  type FeeConfig,
  type CreateContractRequest,
  type DeliverableType,
} from "@repo/shared";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createAndFund, getFeeConfig } from "@/lib/api";
import { deriveDeliverableKey } from "@/lib/deliverableKey";

// Used only until `GET /config/fees` answers. The on-chain Config is the real
// source of truth; these mirror it so the panel isn't blank on first paint.
const FALLBACK_FEES: FeeConfig = {
  protocolFeeBps: DEFAULT_PROTOCOL_FEE_BPS,
  protocolFeeMin: String(DEFAULT_PROTOCOL_FEE_MIN),
  minAmount: String(DEFAULT_MIN_AMOUNT),
  moderatorSurchargeBps: MODERATOR_SURCHARGE_BPS,
  moderatorCount: MODERATOR_COUNT,
};

const toUsdc = (baseUnits: string) => Number(baseUnits) / 1_000_000;

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
  const { publicKey, connected, signTransaction, signMessage } = useWallet();
  const { setVisible } = useWalletModal();

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [type, setType] = useState<DeliverableType>("mergeable");
  const [criteria, setCriteria] = useState<string[]>([""]);
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [noMod, setNoMod] = useState(false);
  const [created, setCreated] = useState<Contract | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: fees = FALLBACK_FEES } = useQuery({
    queryKey: ["feeConfig"],
    queryFn: getFeeConfig,
    staleTime: 5 * 60 * 1000,
  });

  const amountNum = Number(amount) || 0;
  const feeFloor = toUsdc(fees.protocolFeeMin);
  const minAmount = toUsdc(fees.minAmount);

  // Mirrors the program exactly: protocol fee = max(bps of amount, floor), plus
  // the moderator's surcharge. All three numbers come from the api, so what the
  // panel quotes is what the wallet is asked to sign.
  const fee =
    amountNum > 0
      ? Math.max((amountNum * fees.protocolFeeBps) / 10_000, feeFloor)
      : 0;
  // No moderator, no moderator fee — and no verification fee either, since
  // nothing is ever checked. The protocol fee still applies.
  const surcharge = noMod ? 0 : (amountNum * fees.moderatorSurchargeBps) / 10_000;
  const total = amountNum + fee + surcharge;

  // Kept only when a moderator actually rendered a verdict (Pass or Fail); the
  // rest of the protocol fee comes back on a Fail. Mirrors Config.protocol_fee_min.
  const verificationFee = amountNum > 0 && !noMod ? feeFloor : 0;
  const refundedOnFail = amountNum + fee - verificationFee;

  const belowMin = amountNum > 0 && amountNum < minAmount;

  const validCriteria = criteria.map((c) => c.trim()).filter(Boolean);
  const valid =
    title.trim() &&
    brief.trim() &&
    amountNum >= minAmount &&
    deadline &&
    validCriteria.length > 0;

  const createMut = useMutation({
    mutationFn: async () => {
      // Enrol the initiator's deliverable key: sign the fixed message → derive the
      // age recipient the committer will also seal to (so a Pass delivers the
      // verified bytes). Graceful: if the wallet can't sign a message or the user
      // declines, fall back to mods-only sealing.
      let initiatorRecipient: string | undefined;
      if (signMessage) {
        try {
          initiatorRecipient = (await deriveDeliverableKey(signMessage)).recipient;
        } catch {
          initiatorRecipient = undefined;
        }
      }
      const body: CreateContractRequest = {
        initiator: publicKey!.toBase58(),
        title: title.trim(),
        brief: brief.trim(),
        deliverableType: type,
        acceptanceCriteria: validCriteria.map((description) => ({ description })),
        amount: String(Math.round(amountNum * 1_000_000)),
        // All three are recomputed server-side from the live config; sent for shape.
        moderatorCount: noMod ? 0 : fees.moderatorCount,
        moderatorSurcharge: String(Math.round(surcharge * 1_000_000)),
        noMod,
        deadline: new Date(deadline).toISOString(),
        initiatorRecipient,
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
          <p className="mt-1.5 text-xs text-zinc-500">
            {TYPE_HINTS[type]} The moderator only sees the files you submit — pick a
            type checkable from the bundle alone.
          </p>
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

        {/* Opting out of verification. Deliberately plain about who carries the
            risk — the committer can see this mode on the contract too. */}
        <div className="glass p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              checked={noMod}
              onChange={(e) => setNoMod(e.target.checked)}
            />
            <span className="text-sm">
              <span className="text-zinc-200">Skip verification</span>
              <span className="mt-1 block text-xs text-zinc-500">
                No moderator checks the work. You pay no moderator fee.
              </span>
            </span>
          </label>

          {noMod && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                The deliverable is accepted and paid out automatically the moment
                it's submitted. Nobody checks it against your criteria, and there
                is no refund if the work is wrong.{" "}
                <span className="text-amber-200">
                  You are trusting the committer completely.
                </span>
              </span>
            </div>
          )}
        </div>

        {belowMin && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
            Minimum contract is {minAmount} USDC. Below that the{" "}
            {feeFloor.toFixed(2)} fee floor would be an unreasonable share of the
            deal.
          </div>
        )}

        {/* Every line here is derived from the live on-chain config, so the total
            matches what the wallet asks the initiator to sign. */}
        <div className="glass p-4 text-sm">
          <div className="space-y-1.5 text-zinc-400">
            <div className="flex items-center justify-between">
              <span>Payout to committer</span>
              <span className="font-mono text-zinc-200">
                {amountNum.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>
                Protocol fee ({(fees.protocolFeeBps / 100).toFixed(2)}%, min{" "}
                {feeFloor.toFixed(2)})
              </span>
              <span className="font-mono text-zinc-200">{fee.toFixed(2)}</span>
            </div>
            {!noMod && (
              <div className="flex items-center justify-between">
                <span>
                  Moderator fee ({(fees.moderatorSurchargeBps / 100).toFixed(2)}%)
                </span>
                <span className="font-mono text-zinc-200">
                  {surcharge.toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2.5">
            <span className="text-zinc-300">You deposit</span>
            <span className="font-mono text-base font-semibold">
              {total.toFixed(2)} USDC
            </span>
          </div>
          {/* The verification fee is the only thing the protocol keeps when a deal
              doesn't pass — cost recovery for the check that ran, never margin.
              With no moderator there is no failure branch at all. */}
          <p className="mt-2.5 border-t border-white/5 pt-2.5 text-xs text-zinc-500">
            {noMod ? (
              <>
                There is no failing this contract — submission pays out. You are
                only refunded if you cancel before it's accepted, or the committer
                never delivers by the deadline.
              </>
            ) : (
              <>
                If the work fails verification you get {refundedOnFail.toFixed(2)}{" "}
                back. We keep only the {verificationFee.toFixed(2)} verification
                fee, and the moderator keeps its {surcharge.toFixed(2)} for doing
                the check. Nothing at all is charged if you cancel or the committer
                never delivers — and we refund the verification fee if we got the
                call wrong.
              </>
            )}
          </p>
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
