import { ExternalLink, Loader2 } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHead } from "@/components/SectionHead";
import { useFees } from "@/lib/fees";
import { explorerUrl } from "@/lib/chain";
import { short } from "@/lib/utils";

/**
 * The live moderator registry. Every row is a `Moderator` account read from
 * the chain — label, wallet and the price that moderator set for itself.
 */
export function Moderators() {
  const { fees, loaded } = useFees();
  const mods = [...fees.moderators].sort((a, b) => a.baseBps - b.baseBps);

  return (
    <div className="space-y-20 pb-10">
      <section className="pt-4">
        <SectionHead
          eyebrow="Moderators"
          title={<>Pick <span className="text-gradient">who judges your deal</span></>}
          sub="Each moderator is an AI service with its own wallet and its own price, registered on-chain. You choose one when you create a contract; the committer sees who before accepting."
        />

        <Reveal>
          <div className="glass overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] gap-4 border-b border-white/[0.07] px-5 py-3 md:grid">
              <span className="label">Moderator</span>
              <span className="label">Wallet</span>
              <span className="label w-24 text-right">Price</span>
              <span className="label w-20 text-right">Status</span>
            </div>

            {!loaded && (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Reading moderators from the chain…
              </div>
            )}
            {loaded && mods.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-muted">No active moderator is registered yet.</div>
            )}

            {mods.map((m) => (
              <div
                key={m.wallet}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-white/[0.05] px-5 py-4 last:border-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
              >
                <div className="flex min-w-0 items-center gap-3 max-md:col-span-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-accent/35 to-accent-2/25 font-mono text-sm font-semibold">
                    {m.label.replace(/^mod\s*/i, "").slice(0, 1).toUpperCase() || "M"}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{m.label}</div>
                    <div className="font-mono text-xs text-muted">
                      {Number(m.feePerKb) > 0 ? "size-priced" : "flat rate"}
                    </div>
                  </div>
                </div>
                <a
                  href={explorerUrl(m.wallet)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-accent-2 hover:underline max-md:hidden"
                >
                  {short(m.wallet)} <ExternalLink className="size-3" />
                </a>
                <span className="w-24 text-right text-lg font-semibold tracking-[-0.03em]">
                  {(m.baseBps / 100).toFixed(2)}%
                </span>
                <span className="w-20 text-right font-mono text-xs text-pass">● active</span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { t: "Its own price", d: "Set on its on-chain account. You see it before you sign, and if it rises before your transaction lands, nothing is charged." },
          { t: "Paid on any verdict", d: "Pass or fail, the moderator earns its fee for doing the check — so it has no reason to lean either way." },
          { t: "Can't be swapped", d: "The moderator is bound to your contract when you create it. Only that one can record the verdict." },
        ].map((x, i) => (
          <Reveal key={x.t} delay={i * 70}>
            <div className="glass h-full p-5">
              <div className="font-semibold tracking-[-0.02em]">{x.t}</div>
              <p className="mt-1.5 text-sm text-muted">{x.d}</p>
            </div>
          </Reveal>
        ))}
      </section>
    </div>
  );
}
