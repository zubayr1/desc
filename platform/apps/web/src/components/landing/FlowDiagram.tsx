import { Cpu, Lock, ShieldCheck, User } from "lucide-react";
import { Logo } from "../Logo";

/**
 * Initiator → program ← committer, then the verdict splits the money back out.
 * The second row is the point: money and work both go IN, and only a verdict
 * decides which way it comes back OUT.
 */
export function FlowDiagram() {
  return (
    <div>
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)] md:gap-0">
        <Party icon={<User className="size-5 text-lilac" />} title="Initiator" sub="locks the payment" tone="violet" />
        <Rail label="1 · Funds in" dir="in" />
        <Core />
        <Rail label="2 · Sealed work" dir="work" />
        <Party icon={<ShieldCheck className="size-5 text-accent-2" />} title="Committer" sub="delivers the files" tone="cyan" />
      </div>

      <div className="mt-6 grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="glass flex items-center gap-3 border-fail/25 px-4 py-3.5">
          <span className="text-xl text-muted">←</span>
          <div>
            <div className="font-semibold tracking-[-0.02em] text-fail">Fail</div>
            <div className="text-sm text-muted">refunded to the initiator</div>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <span className="chip"><Lock className="size-3.5 text-lilac" /> Program holds it</span>
          <span className="chip"><Cpu className="size-3.5 text-lilac" /> 3 · AI verdict</span>
        </div>
        <div className="glass flex items-center justify-end gap-3 border-pass/30 px-4 py-3.5 text-right shadow-[0_16px_50px_-30px_rgba(56,211,159,.7)]">
          <div>
            <div className="font-semibold tracking-[-0.02em] text-pass">Pass</div>
            <div className="text-sm text-muted">paid to the committer</div>
          </div>
          <span className="text-xl text-muted">→</span>
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-xl text-center text-muted">
        Neither side holds the money, and neither side judges the work.
      </p>
    </div>
  );
}

function Party({ icon, title, sub, tone }: { icon: React.ReactNode; title: string; sub: string; tone: "violet" | "cyan" }) {
  return (
    <div className="glass grid w-full justify-items-center gap-1 px-4 py-5 text-center">
      <span
        className={
          "mb-1.5 grid size-11 place-items-center rounded-xl border " +
          (tone === "violet" ? "border-accent/30 bg-accent/10" : "border-accent-2/30 bg-accent-2/10")
        }
      >
        {icon}
      </span>
      <b className="text-lg font-semibold tracking-[-0.03em]">{title}</b>
      <span className="text-sm text-muted">{sub}</span>
    </div>
  );
}

function Rail({ label, dir }: { label: string; dir: "in" | "work" }) {
  const isIn = dir === "in";
  return (
    <div
      className="relative mx-2 hidden h-px md:block"
      style={{
        background: isIn
          ? "linear-gradient(90deg, rgba(139,92,255,.1), rgba(139,92,255,.7))"
          : "linear-gradient(90deg, rgba(54,224,211,.7), rgba(54,224,211,.1))",
      }}
    >
      <span className="label absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">{label}</span>
      {[0, 0.8, 1.6].map((d) => (
        <i
          key={d}
          className="absolute -top-[3px] size-[7px] rounded-full"
          style={{
            background: isIn ? "#b69cff" : "#7ff0e6",
            boxShadow: isIn ? "0 0 10px 2px rgba(139,92,255,.8)" : "0 0 10px 2px rgba(54,224,211,.8)",
            animation: `${isIn ? "to-right" : "to-left"} 2.4s linear ${d}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Core() {
  return (
    <div className="relative mx-auto grid size-[150px] place-items-center">
      <span className="absolute inset-0 rounded-full border border-white/[0.08]" style={{ animation: "spin-slow 9s linear infinite" }}>
        <span className="absolute -top-[3px] left-1/2 size-1.5 rounded-full bg-accent-2 shadow-[0_0_12px_var(--color-accent-2)]" />
      </span>
      <span
        className="absolute inset-[18px] rounded-full border border-accent/20"
        style={{ animation: "spin-slow 6s linear infinite reverse" }}
      >
        <span className="absolute -top-[3px] left-1/2 size-1.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
      </span>
      <Logo className="size-[84px] drop-shadow-[0_0_28px_rgba(139,92,255,.55)]" />
    </div>
  );
}
