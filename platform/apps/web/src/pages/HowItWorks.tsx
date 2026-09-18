import { Link } from "react-router-dom";
import {
  ArrowRight, CheckCircle2, Cpu, EyeOff, FileText, Link2, Lock, Network, PenTool, Scale,
  ScanLine, UploadCloud, Wallet, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/landing/Reveal";
import { FlowDiagram } from "@/components/landing/FlowDiagram";
import { SectionHead } from "@/components/SectionHead";

/** The six real on-chain / off-chain steps of a contract, in order. */
const STEPS: { icon: LucideIcon; t: string; d: string }[] = [
  { icon: FileText, t: "Draft", d: "The initiator writes the brief and criteria a moderator can check from files alone." },
  { icon: Wallet, t: "Fund", d: "USDC moves into a vault owned by the escrow program — not by us, not by them." },
  { icon: Link2, t: "Accept", d: "The committer opens the shared link, reads the terms, and accepts with their wallet." },
  { icon: UploadCloud, t: "Deliver", d: "Files are encrypted in the browser. Only their hash goes on-chain." },
  { icon: Cpu, t: "Verify", d: "The moderator decrypts, confirms the hash, and judges each criterion." },
  { icon: CheckCircle2, t: "Settle", d: "The program pays the committer on a pass, or refunds the initiator on a fail." },
];

const MODERATION: { icon: LucideIcon; t: string; d: string }[] = [
  { icon: Lock, t: "Sealed", d: "Encrypted in your browser to the moderator and the initiator. Our server stores ciphertext it cannot read." },
  { icon: ScanLine, t: "Checked", d: "The moderator proves it opened the exact bytes you delivered — the hash must match the chain." },
  { icon: PenTool, t: "Signed", d: "It signs the verdict with its own wallet. No platform key can record one." },
];

const GUARANTEES: { icon: LucideIcon; t: string; d: string }[] = [
  { icon: Lock, t: "Escrowed, not entrusted", d: "The program holds the money. Neither party, and not us." },
  { icon: EyeOff, t: "Private by default", d: "Only the moderator and the initiator can open the delivery." },
  { icon: Scale, t: "Settles on the verdict", d: "Released or refunded by code, the moment a verdict exists." },
  { icon: Network, t: "Verifiable", d: "Every step is a Solana transaction anyone can inspect." },
];

export function HowItWorks() {
  return (
    <div className="space-y-24 pb-10">
      <section className="pt-4">
        <SectionHead
          eyebrow="How it works"
          title={<>A deal where <span className="text-gradient">nobody has to go first</span></>}
          sub="The committer won't build before seeing money. The initiator won't pay before seeing work. desc holds the money while a moderator neither side controls checks the work."
        />
        <Reveal>
          <div className="glass p-6 md:p-10">
            <FlowDiagram />
          </div>
        </Reveal>
      </section>

      <section>
        <SectionHead eyebrow="Step by step" title="Six steps, each one on-chain or sealed" />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 60}>
              <div className="glass glass-hover h-full p-5">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl border border-accent/25 bg-accent/10">
                    <s.icon className="size-5 text-lilac" />
                  </span>
                  <span className="font-mono text-xs text-muted">Step {i + 1}</span>
                </div>
                <div className="mt-4 text-lg font-semibold tracking-[-0.03em]">{s.t}</div>
                <p className="mt-1 text-sm text-muted">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <section>
        <SectionHead
          eyebrow="The moderator"
          title="Sealed, checked, signed"
          sub="The moderator is a service with its own wallet. It judges the files against your criteria and signs the result itself."
        />
        <div className="grid gap-3 md:grid-cols-3">
          {MODERATION.map((m, i) => (
            <Reveal key={m.t} delay={i * 80}>
              <div className="glass h-full p-6">
                <span className="btn-accent grid size-10 place-items-center rounded-xl text-white">
                  <m.icon className="size-5" />
                </span>
                <div className="mt-4 text-lg font-semibold tracking-[-0.03em]">{m.t}</div>
                <p className="mt-1.5 text-sm text-muted">{m.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section>
        <SectionHead eyebrow="Guarantees" title="Code, not goodwill" />
        <div className="grid gap-3 sm:grid-cols-2">
          {GUARANTEES.map((g, i) => (
            <Reveal key={g.t} delay={i * 60}>
              <div className="glass flex h-full items-start gap-4 p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5">
                  <g.icon className="size-5 text-accent-2" />
                </span>
                <div>
                  <div className="font-semibold">{g.t}</div>
                  <p className="mt-1 text-sm text-muted">{g.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
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
