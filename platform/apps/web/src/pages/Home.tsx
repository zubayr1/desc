import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  EyeOff,
  FileText,
  Link2,
  Lock,
  Network,
  PenTool,
  Plus,
  ScanLine,
  Scale,
  UploadCloud,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/landing/Reveal";
import { FlowDiagram } from "@/components/landing/FlowDiagram";

const STEPS: { n: string; icon: LucideIcon; t: string; d: string }[] = [
  { n: "01", icon: FileText, t: "Draft", d: "Initiator writes the brief + checkable criteria" },
  { n: "02", icon: Wallet, t: "Fund", d: "USDC locked in the on-chain escrow" },
  { n: "03", icon: Link2, t: "Accept", d: "Committer opens the link and accepts" },
  { n: "04", icon: UploadCloud, t: "Submit", d: "Work sealed + encrypted to the moderators" },
  { n: "05", icon: Cpu, t: "Verify", d: "AI moderator checks it against the criteria" },
  { n: "06", icon: CheckCircle2, t: "Settle", d: "Released on pass, refunded on fail" },
];

const MOD: { icon: LucideIcon; t: string; d: string }[] = [
  {
    icon: Lock,
    t: "Sealed",
    d: "The deliverable is encrypted in your browser to the moderators only. The platform stores ciphertext it can't read.",
  },
  {
    icon: ScanLine,
    t: "Checked",
    d: "The moderator decrypts, confirms the bytes match the on-chain hash, then runs your acceptance criteria.",
  },
  {
    icon: PenTool,
    t: "Signed",
    d: "It signs the verdict with its own non-custodial wallet — on-chain, with no central key that can adjudicate.",
  },
];

const GUARANTEES: { icon: LucideIcon; t: string; d: string }[] = [
  { icon: Lock, t: "Escrowed, not entrusted", d: "Funds held by the protocol — never the other party." },
  { icon: EyeOff, t: "Confidential by default", d: "Your deliverable stays sealed until payment; the server is blind." },
  { icon: Scale, t: "Settles on the verdict", d: "Released or refunded automatically — code, not goodwill." },
  { icon: Network, t: "On-chain + neutral", d: "Every step is verifiable on Solana. desc is the layer, not a side." },
];

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-accent-2">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {title}
      </h2>
      {sub && <p className="mx-auto mt-3 max-w-xl text-zinc-400">{sub}</p>}
    </Reveal>
  );
}

export function Home() {
  return (
    <div className="space-y-28 pb-16">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-6 text-center md:pt-12">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            <span className="size-1.5 animate-pulse rounded-full bg-st-settled" />
            On-chain USDC escrow · AI-verified settlement
          </span>
        </Reveal>
        <Reveal delay={70}>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-tight text-balance md:text-6xl">
            Wrap your deal in a <span className="text-gradient">layer of trust.</span>
          </h1>
        </Reveal>
        <Reveal delay={130}>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
            Two parties who don't fully trust each other, one escrow that settles on{" "}
            <span className="text-zinc-200">AI-verified proof</span> — not promises.
          </p>
        </Reveal>
        <Reveal delay={190}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/new">
              <Button variant="accent">
                <Plus className="size-4" /> Create a contract
              </Button>
            </Link>
            <Link to="/contracts">
              <Button variant="outline">
                View my contracts <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── Flow diagram ─────────────────────────────────────── */}
      <section>
        <SectionHead
          eyebrow="How it works"
          title="A neutral layer between two parties"
          sub="No marketplace, no middleman taking sides — just a trust layer that holds the money and lets proof decide."
        />
        <Reveal>
          <div className="glass p-6 md:p-10">
            <FlowDiagram />
          </div>
        </Reveal>
      </section>

      {/* ── Lifecycle ────────────────────────────────────────── */}
      <section>
        <SectionHead
          eyebrow="The flow"
          title="Six steps, fully on-chain"
          sub="From a handshake to a settled deal — every transition is a verifiable on-chain event."
        />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 70}>
              <div className="group glass relative h-full overflow-hidden p-4 transition duration-300 hover:-translate-y-1.5 hover:border-accent/20 hover:shadow-[0_14px_40px_-22px_rgba(139,92,255,0.2)]">
                {/* soft accent glow from the top, on hover */}
                <span
                  className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(130px 80px at 50% 0%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 72%)",
                  }}
                />
                {/* accent line draws across the bottom, on hover */}
                <span
                  className="absolute inset-x-0 bottom-0 z-0 h-[2px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{
                    background: "linear-gradient(90deg, var(--color-accent), var(--color-accent-2))",
                  }}
                />
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <span className="grid size-8 place-items-center rounded-lg bg-white/5 text-accent-2 transition duration-300 group-hover:scale-110 group-hover:bg-accent/12">
                      <s.icon className="size-4 transition-transform duration-300 group-hover:-rotate-6" />
                    </span>
                    <span className="font-mono text-xs text-zinc-600 transition-colors duration-300 group-hover:text-accent-2">
                      {s.n}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-medium text-zinc-100">{s.t}</div>
                  <div className="mt-1 text-xs leading-snug text-zinc-500 transition-colors duration-300 group-hover:text-zinc-300">
                    {s.d}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ── AI moderation ────────────────────────────────────── */}
      <section>
        <SectionHead
          eyebrow="AI moderation"
          title="Verified by AI, not vibes"
          sub="The moderator is an automated service with its own wallet — it judges the work and signs the verdict itself. Anyone can bring their own."
        />
        <div className="grid gap-3 md:grid-cols-3">
          {MOD.map((m, i) => (
            <Reveal key={m.t} delay={i * 90}>
              <div className="glass glass-hover h-full p-6">
                <span className="grid size-10 place-items-center rounded-xl btn-accent text-white">
                  <m.icon className="size-5" />
                </span>
                <div className="mt-4 text-base font-semibold text-zinc-100">{m.t}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{m.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120} className="mx-auto mt-6 max-w-2xl text-center text-sm text-zinc-500">
          The deliverable hash is anchored on-chain, so the moderator proves it judged the{" "}
          <span className="text-zinc-300">exact bytes</span> you committed — nothing swapped after the fact.
        </Reveal>
      </section>

      {/* ── Guarantees ───────────────────────────────────────── */}
      <section>
        <SectionHead eyebrow="Why desc" title="Guarantees, not goodwill" />
        <div className="grid gap-3 sm:grid-cols-2">
          {GUARANTEES.map((g, i) => (
            <Reveal key={g.t} delay={i * 80}>
              <div className="glass glass-hover flex h-full items-start gap-4 p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-accent-2">
                  <g.icon className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{g.t}</div>
                  <p className="mt-1 text-sm text-zinc-400">{g.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section>
        <SectionHead
          eyebrow="Pricing"
          title="One flat fee, no surprises"
          sub="No subscriptions, no listing fees — you pay only when you escrow a deal."
        />
        <Reveal className="glass mx-auto max-w-md p-8 text-center">
          <div className="text-5xl font-semibold tracking-tight">
            2%
            <span className="ml-1 text-lg font-normal text-zinc-500">+ moderator fee</span>
          </div>
          <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-400">
            A flat 2% protocol fee per contract, plus a small fee to the AI moderator that
            verifies it. Settled in USDC, on-chain.
          </p>
          <Link to="/new" className="mt-6 inline-block">
            <Button variant="accent">
              <Plus className="size-4" /> Create a contract
            </Button>
          </Link>
        </Reveal>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <Reveal>
        <section className="glass relative overflow-hidden p-10 text-center md:p-16">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Ready to make your deal <span className="text-gradient">safe</span>?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-zinc-400">
            Draft a contract, share the link, and let the proof settle it.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/new">
              <Button variant="accent">
                <Plus className="size-4" /> Create a contract
              </Button>
            </Link>
            <Link to="/contracts">
              <Button variant="outline">
                View my contracts <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
