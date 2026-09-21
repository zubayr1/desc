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
  type Contract,
  type FeeConfig,
  type CreateContractRequest,
  type DeliverableType,
  type ModeratorOffer,
} from "@repo/shared";
import { Card } from "@/components/ui/Card";
import { ModeratorPicker } from "@/components/ModeratorPicker";
import { Button } from "@/components/ui/Button";
import { createAndFund, getFeeConfig } from "@/lib/api";
import { deriveDeliverableKey } from "@/lib/deliverableKey";

// Used only until `GET /config/fees` answers. The on-chain Config is the real
// source of truth; these mirror it so the panel isn't blank on first paint.
const FALLBACK_FEES: FeeConfig = {
  protocolFeeBps: DEFAULT_PROTOCOL_FEE_BPS,
  protocolFeeMin: String(DEFAULT_PROTOCOL_FEE_MIN),
  minAmount: String(DEFAULT_MIN_AMOUNT),
  // No fallback moderator: a moderator's price is its own, on-chain. Guessing
  // one here would quote a number the wallet is never asked to sign.
  moderators: [],
};

const toUsdc = (baseUnits: string) => Number(baseUnits) / 1_000_000;

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="label mb-2">{label}</div>
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
  const [modWallets, setModWallets] = useState<string[]>([]);
  const [created, setCreated] = useState<Contract | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: fees = FALLBACK_FEES, isSuccess: feesLoaded } = useQuery({
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
  // Each moderator's fee is ITS price, read from its on-chain account — the same
  // numbers create_escrow reads. With exactly one registered, it is picked for you.
  const panel = noMod
    ? []
    : modWallets.length
      ? modWallets
          .map((w) => fees.moderators.find((m) => m.wallet === w))
          .filter((m): m is ModeratorOffer => !!m)
      : fees.moderators.length === 1
        ? [fees.moderators[0]]
        : [];
  // 1 or 3. An even panel has no majority, so the program rejects it — say so
  // here rather than letting the wallet sign a transaction that cannot land.
  const panelOk = panel.length === 1 || panel.length === 3;
  const needsModerator = !noMod && !panelOk;
  // The same fees in base units, with the program's integer math — so the limit
  // we send equals what the program computes, not a float that is 1 unit short.
  // SUMMED, never divided: each moderator runs the whole check and earns a full fee.
  const amountBase = BigInt(Math.round(amountNum * 1_000_000));
  const surchargeBase = panel.reduce(
    (sum, m) =>
      sum +
      (amountBase * BigInt(m.baseBps)) / 10_000n +
      BigInt(m.feePerKb) * BigInt(m.maxBundleKb),
    0n
  );
  const surcharge = panel.reduce(
    (sum, m) =>
      sum + (amountNum * m.baseBps) / 10_000 + toUsdc(m.feePerKb) * m.maxBundleKb,
    0
  );
  const total = amountNum + fee + surcharge;

  // Kept only when a moderator actually rendered a verdict (Pass or Fail); the
  // rest of the protocol fee comes back on a Fail. Mirrors Config.protocol_fee_min.
  const verificationFee = amountNum > 0 && !noMod ? feeFloor : 0;
  const refundedOnFail = amountNum + fee - verificationFee;

  const belowMin = amountNum > 0 && amountNum < minAmount;

  // The program rejects a deadline that is already past, and a bare date string
  // resolves to midnight — so "today" is behind us by the time the wallet signs.
  // Validate the exact value the request sends, and stop the picker offering a
  // date that cannot work.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDeadline = tomorrow.toISOString().slice(0, 10);
  const deadlineOk = deadline !== "" && new Date(deadline).getTime() > Date.now();
  const deadlinePast = deadline !== "" && !deadlineOk;

  const validCriteria = criteria.map((c) => c.trim()).filter(Boolean);
  const valid =
    title.trim() &&
    brief.trim() &&
    amountNum >= minAmount &&
    deadlineOk &&
    !needsModerator &&
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
        // No fee is sent: the program reads the chosen moderator's price itself.
        noMod,
        moderators: noMod ? undefined : panel.map((m) => m.wallet),
        // What the initiator is looking at. A price rise since → creation fails.
        maxModeratorFee: surchargeBase.toString(),
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
      <div className="mx-auto max-w-2xl pt-6">
        <Card className="p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-pass/15 text-pass shadow-[0_0_24px_rgba(56,211,159,.35)]">
              <Check className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.04em]">Contract funded</h1>
              <p className="text-sm text-muted">The money is in the program. Now send the link.</p>
            </div>
          </div>
          <div className="label mt-6">Share with your committer</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="inp flex-1 truncate font-mono text-zinc-300">{link}</div>
            <Button
              variant="outline"
              className="px-3"
              aria-label="Copy link"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4 text-pass" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            They review the terms, connect a wallet, and accept — no account needed.
          </p>
          <Link to={`/contracts/${created.id}`}>
            <Button variant="accent" className="mt-6 w-full py-3">
              View contract <ArrowRight className="size-4" />
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────
  return (
    <div className="pt-2">
      <div className="mb-8">
        <div className="label">New contract</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">Make the deal safe</h1>
        <p className="mt-2 text-muted">Write what "done" means, lock the payment, and share the link.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="space-y-6 p-6 md:p-7">
          <FormField label="Title">
            <input
              id="title"
              className="inp"
              placeholder="Implement token vesting program"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormField>

          <FormField label="Brief">
            <textarea
              id="brief"
              rows={3}
              className="inp resize-none"
              placeholder="Describe the work and what 'done' looks like…"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </FormField>

          <FormField label="Deliverable type">
            <select
              id="type"
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
            <p className="mt-1.5 text-xs text-muted">
              {TYPE_HINTS[type]} The moderator only sees the files you submit — pick a
              type checkable from the bundle alone.
            </p>
          </FormField>

          <FormField label="Acceptance criteria — what the moderator checks">
            <div className="space-y-2">
              {criteria.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <input
                    id={`criterion-${i}`}
                    className="inp"
                    placeholder="e.g. All tests in /tests pass"
                    value={c}
                    onChange={(e) =>
                      setCriteria((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))
                    }
                  />
                  {criteria.length > 1 && (
                    <button
                      aria-label={`Remove criterion ${i + 1}`}
                      onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}
                      className="text-zinc-600 hover:text-zinc-300"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setCriteria((cs) => [...cs, ""])}
                className="ml-8 inline-flex items-center gap-1.5 text-sm text-lilac hover:text-ink"
              >
                <Plus className="size-4" /> Add criterion
              </button>
            </div>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount (USDC)">
              <input
                id="amount"
                className="inp"
                inputMode="decimal"
                placeholder="0.00"
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
                id="deadline"
                type="date"
                className="inp"
                min={minDeadline}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              {deadlinePast && (
                <p className="mt-1.5 text-xs text-amber-300">
                  Pick a future date — the escrow would be rejected on signing.
                </p>
              )}
            </FormField>
          </div>

          {!noMod && (
            <FormField label="Moderator — who judges the work">
              {feesLoaded && fees.moderators.length === 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
                  No moderator is available right now. Try again later, or skip
                  verification below.
                </div>
              ) : (
                <>
                  <ModeratorPicker
                    moderators={fees.moderators}
                    selected={panel.map((m) => m.wallet)}
                    onChange={setModWallets}
                    sizes={[1, 3]}
                    amount={amountNum}
                  />
                  {panel.length === 2 && (
                    <p className="mt-2 text-sm text-fail">
                      Pick one more, or drop one. Two moderators can split 1–1 and
                      never reach a majority, so the program only accepts 1 or 3.
                    </p>
                  )}
                </>
              )}
            </FormField>
          )}

          {/* Opting out of verification. Deliberately plain about who carries the
              risk — the committer can see this mode on the contract too. */}
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                checked={noMod}
                onChange={(e) => setNoMod(e.target.checked)}
              />
              <span className="text-sm">
                <span className="text-zinc-200">Skip verification</span>
                <span className="mt-1 block text-xs text-muted">
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
                  <span className="text-amber-200">You are trusting the committer completely.</span>
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
        </Card>

        {/* Every line here is derived from the live on-chain config, so the total
            matches what the wallet asks the initiator to sign. */}
        <Card className="space-y-4 p-6 lg:sticky lg:top-24">
          <div className="text-xl font-semibold tracking-[-0.035em]">You deposit</div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Payout to committer</dt>
              <dd className="font-mono tabular-nums">{amountNum.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Protocol fee</dt>
              <dd className="font-mono tabular-nums">{fee.toFixed(2)}</dd>
            </div>
            {!noMod && (
              <div className="flex justify-between gap-3">
                <dt className="truncate text-muted">
                  {panel.length > 1 ? `Moderators · ${panel.length}` : "Moderator"}
                  {panel.length ? ` · ${panel.map((m) => m.label).join(", ")}` : ""}
                </dt>
                <dd className="font-mono tabular-nums">{surcharge.toFixed(2)}</dd>
              </div>
            )}
          </dl>
          <div className="flex items-baseline justify-between border-t border-white/[0.08] pt-4">
            <span className="text-muted">Total</span>
            <span className="text-3xl font-semibold tracking-[-0.045em] tabular-nums">
              {total.toFixed(2)} <span className="font-mono text-sm font-normal text-muted">USDC</span>
            </span>
          </div>

          {/* The verification fee is the only thing the protocol keeps when a deal
              doesn't pass — cost recovery for the check that ran, never margin.
              With no moderator there is no failure branch at all. */}
          <p className="text-xs leading-relaxed text-muted">
            {noMod ? (
              <>
                There is no failing this contract — submission pays out. You are only
                refunded if you cancel before it's accepted, or the committer never
                delivers by the deadline.
              </>
            ) : (
              <>
                If the work fails verification you get {refundedOnFail.toFixed(2)} back — we
                keep only the {verificationFee.toFixed(2)} check fee and the{" "}
                {panel.length > 1 ? "moderators keep their" : "moderator keeps its"}{" "}
                {surcharge.toFixed(2)}. If it's never delivered, nothing is charged.
              </>
            )}
          </p>

          {createMut.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
              {createMut.error.message}
            </div>
          )}

          {!connected ? (
            <Button variant="accent" className="w-full py-3" onClick={() => setVisible(true)}>
              Connect wallet to continue
            </Button>
          ) : (
            <Button
              variant="accent"
              className="w-full py-3"
              disabled={!valid || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Funding…
                </>
              ) : total > 0 ? (
                `Lock ${total.toFixed(2)} USDC`
              ) : (
                "Lock USDC"
              )}
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
