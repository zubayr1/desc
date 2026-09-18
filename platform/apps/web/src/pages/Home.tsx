import { Link } from "react-router-dom";
import { ArrowRight, Copy, ExternalLink, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/landing/Reveal";
import { WhyDesc } from "@/components/landing/WhyDesc";
import { FlowDiagram } from "@/components/landing/FlowDiagram";
import { Outcomes } from "@/components/landing/Outcomes";
import { SectionHead } from "@/components/SectionHead";
import { useFees } from "@/lib/fees";
import { ESCROW_PROGRAM_ID, MODERATION_PROGRAM_ID, clusterLabel, explorerUrl } from "@/lib/chain";
import { short } from "@/lib/utils";

export function Home() {
  const { protocolPct, feeFloor, cheapestModPct } = useFees();

  return (
    <div className="space-y-28 pb-10">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="grid items-center gap-12 pt-4 md:pt-10 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 font-mono text-xs text-lilac">
              ◆ Escrow on Solana · judged by AI
            </span>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="mt-6 text-5xl font-semibold leading-none tracking-[-0.05em] text-balance md:text-[4.3rem]">
              You already made the deal. <span className="text-gradient">Now make it safe.</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Lock USDC in a Solana program. An AI moderator checks the{" "}
              <b className="font-medium text-ink">delivered files</b> against the criteria you both agreed. The
              program pays out on that verdict — <b className="font-medium text-ink">no one else can move the money</b>.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/new">
                <Button variant="accent" className="px-5 py-3">
                  <Plus className="size-4" /> Create a contract
                </Button>
              </Link>
              <Link to="/how-it-works">
                <Button variant="outline" className="px-5 py-3">
                  How it works <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <dl className="mt-10 flex flex-wrap gap-x-9 gap-y-4 font-mono text-xs text-muted">
              <div className="flex flex-col-reverse">
                <dt>protocol fee, min ${feeFloor.toFixed(0)}</dt>
                <dd className="font-sans text-lg font-semibold text-ink">{protocolPct}%</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt>moderator, you choose</dt>
                <dd className="font-sans text-lg font-semibold text-ink">
                  {cheapestModPct === undefined ? "Set by each" : `from ${cheapestModPct}%`}
                </dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt>if it's never delivered</dt>
                <dd className="font-sans text-lg font-semibold text-ink">No fee</dd>
              </div>
            </dl>
          </Reveal>
        </div>
        <Reveal delay={150}>
          <WhyDesc />
        </Reveal>
      </section>

      {/* ── Real, verifiable program addresses ─────────────── */}
      <Reveal>
        <div className="glass flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-accent-2 shadow-[0_0_10px_var(--color-accent-2)]" />
            Live on Solana <b className="font-medium">{clusterLabel}</b>
          </div>
          <div className="flex flex-wrap gap-2">
            <ProgramId label="Escrow program" id={ESCROW_PROGRAM_ID} />
            <ProgramId label="Moderation program" id={MODERATION_PROGRAM_ID} />
          </div>
        </div>
      </Reveal>

      {/* ── How a deal runs ────────────────────────────────── */}
      <section>
        <SectionHead
          eyebrow="How a deal runs"
          title="Two strangers, one program in the middle"
          sub="Money and work both go in. Only the verdict decides which way the money comes out."
        />
        <Reveal>
          <div className="glass p-6 md:p-10">
            <FlowDiagram />
          </div>
        </Reveal>
      </section>

      {/* ── Outcomes ───────────────────────────────────────── */}
      <section>
        <SectionHead
          eyebrow="Where the money goes"
          title="Every ending is decided in advance"
          sub="Nothing is charged for a deal that never happens, and the protocol never profits from one that fails."
        />
        <Reveal>
          <Outcomes />
        </Reveal>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <Reveal>
        <section className="glass relative overflow-hidden px-6 py-14 text-center md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(40rem 18rem at 50% 0%, rgba(139,92,255,.18), transparent 70%)" }}
          />
          <h2 className="relative text-3xl font-semibold tracking-[-0.045em] text-balance md:text-5xl">
            Stop going first. <span className="text-gradient">Let the program hold it.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-muted">
            Write the criteria, lock the payment, and send the link.
          </p>
          <Link to="/new" className="relative mt-8 inline-block">
            <Button variant="accent" className="px-6 py-3">
              Create a contract <ArrowRight className="size-4" />
            </Button>
          </Link>
        </section>
      </Reveal>
    </div>
  );
}

function ProgramId({ label, id }: { label: string; id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 py-1.5 pl-3 pr-1.5 font-mono text-xs text-muted">
      {label}
      <a href={explorerUrl(id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-2 hover:underline">
        {short(id)} <ExternalLink className="size-3" />
      </a>
      <button
        type="button"
        aria-label={`Copy ${label} address`}
        className="grid size-6 place-items-center rounded-md hover:bg-white/10"
        onClick={() => {
          void navigator.clipboard.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <span className="text-pass">✓</span> : <Copy className="size-3" />}
      </button>
    </span>
  );
}
