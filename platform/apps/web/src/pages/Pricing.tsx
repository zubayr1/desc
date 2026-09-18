import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/landing/Reveal";
import { Outcomes } from "@/components/landing/Outcomes";
import { SectionHead } from "@/components/SectionHead";
import { useFees } from "@/lib/fees";

/** Everything here is read from the chain; the calculator only uses your input. */
export function Pricing() {
  const { fees, protocolPct, feeFloor, minContract, cheapestModPct } = useFees();
  const [amount, setAmount] = useState("");
  const [modWallet, setModWallet] = useState("");

  const mod = fees.moderators.find((m) => m.wallet === modWallet) ?? fees.moderators[0];
  const a = Number(amount) || 0;
  const protocol = a > 0 ? Math.max((a * fees.protocolFeeBps) / 10_000, feeFloor) : 0;
  const modFee = mod ? (a * mod.baseBps) / 10_000 : 0;
  const total = a + protocol + modFee;
  const failRefund = a + protocol - (a > 0 ? feeFloor : 0);

  return (
    <div className="space-y-24 pb-10">
      <section className="pt-4">
        <SectionHead
          eyebrow="Pricing"
          title={<>Priced per deal. <span className="text-gradient">Paid by the initiator.</span></>}
          sub="No subscriptions, no listing fees. The committer always receives the full amount."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Rate big={`${protocolPct}%`} label="Protocol fee" note={`of the amount, minimum $${feeFloor.toFixed(0)}`} />
          <Rate
            big={cheapestModPct === undefined ? "Set by each" : `from ${cheapestModPct}%`}
            label="Moderator fee"
            note="each moderator sets its own price on-chain"
          />
          <Rate big={`$${minContract.toFixed(0)}`} label="Smallest contract" note="below this the minimum fee is too large a share" />
        </div>
      </section>

      <section>
        <SectionHead eyebrow="Calculator" title="See your deposit before you sign" />
        <Reveal>
          <div className="glass mx-auto grid max-w-3xl gap-8 p-6 md:grid-cols-2 md:p-8">
            <div className="space-y-4">
              <label className="block">
                <span className="label">Amount to pay the committer (USDC)</span>
                <input
                  id="pricing-amount"
                  className="inp mt-2 text-lg"
                  inputMode="decimal"
                  placeholder="Enter an amount"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
                  }}
                />
              </label>
              {fees.moderators.length > 0 && (
                <label className="block">
                  <span className="label">Moderator</span>
                  <select
                    id="pricing-mod"
                    className="inp mt-2"
                    value={mod?.wallet ?? ""}
                    onChange={(e) => setModWallet(e.target.value)}
                  >
                    {fees.moderators.map((m) => (
                      <option key={m.wallet} value={m.wallet}>
                        {m.label} — {(m.baseBps / 100).toFixed(2)}%
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <dl className="space-y-2 text-sm">
              <Line k="Committer receives" v={a} />
              <Line k="Protocol fee" v={protocol} />
              <Line k={mod ? `Moderator · ${mod.label}` : "Moderator"} v={modFee} />
              <div className="mt-3 flex items-baseline justify-between border-t border-white/[0.08] pt-3">
                <dt className="text-muted">You deposit</dt>
                <dd className="text-3xl font-semibold tracking-[-0.045em]">{total.toFixed(2)}</dd>
              </div>
              <p className="pt-2 text-xs text-muted">
                On a fail you get {failRefund.toFixed(2)} back. If it's never delivered, you get all of it back.
              </p>
            </dl>
          </div>
        </Reveal>
      </section>

      <section>
        <SectionHead eyebrow="Outcomes" title="Where the money goes, in every ending" />
        <Reveal>
          <Outcomes />
        </Reveal>
        <div className="mt-10 flex justify-center">
          <Link to="/new">
            <Button variant="accent" className="px-5 py-3">
              Create a contract <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Rate({ big, label, note }: { big: string; label: string; note: string }) {
  return (
    <Reveal>
      <div className="glass h-full p-6">
        <div className="label">{label}</div>
        <div className="mt-3 text-4xl font-semibold tracking-[-0.05em]">{big}</div>
        <p className="mt-2 text-sm text-muted">{note}</p>
      </div>
    </Reveal>
  );
}

function Line({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono tabular-nums">{v.toFixed(2)}</dd>
    </div>
  );
}
