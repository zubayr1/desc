import { Cpu, Lock, ShieldCheck, User, type LucideIcon } from "lucide-react";

const ACCENT = "var(--color-accent)"; // violet
const CYAN = "var(--color-accent-2)"; // cyan

/** A connector rail with particles flowing toward (or, reversed, away from) the core. */
function Rail({ hue, label, reverse }: { hue: string; label: string; reverse?: boolean }) {
  return (
    <div className="relative hidden flex-1 self-center md:block">
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className="relative h-px w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${hue}, transparent)` }}
      >
        {[0, 1.1, 2.2].map((d, i) => (
          <span
            key={i}
            className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full"
            style={{
              background: hue,
              boxShadow: `0 0 8px 1px ${hue}`,
              animation: "flow-x 3.2s linear infinite",
              animationDelay: `${d}s`,
              animationDirection: reverse ? "reverse" : "normal",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Party({
  icon: Icon,
  title,
  sub,
  delay,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  delay: number;
}) {
  return (
    <div
      className="glass flex w-full flex-col items-center gap-2 p-5 text-center md:w-44"
      style={{ animation: `float-y 6s ease-in-out ${delay}s infinite` }}
    >
      <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-accent-2">
        <Icon className="size-5" />
      </span>
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <div className="text-xs leading-snug text-zinc-500">{sub}</div>
    </div>
  );
}

function Core() {
  return (
    <div className="grid shrink-0 place-items-center">
      <div className="relative grid size-32 place-items-center">
        <span
          className="absolute size-24 rounded-full border border-accent/40"
          style={{ animation: "pulse-ring 3s ease-out infinite" }}
        />
        <span
          className="absolute size-24 rounded-full border border-accent-2/40"
          style={{ animation: "pulse-ring 3s ease-out 1.5s infinite" }}
        />
        <div className="btn-accent relative z-10 grid size-24 place-items-center overflow-hidden rounded-full">
          <span className="text-xl font-bold tracking-tight text-white">desc</span>
          {/* AI scan line */}
          <span
            className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-white/70"
            style={{ animation: "scan-y 2.4s ease-in-out infinite" }}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-zinc-300">
          <Lock className="size-3 text-accent-2" /> escrow vault
        </span>
        <span
          className="glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-zinc-300"
          style={{ animation: "glow-pulse 2.4s ease-in-out infinite" }}
        >
          <Cpu className="size-3 text-accent" /> AI moderator
        </span>
      </div>
    </div>
  );
}

export function FlowDiagram() {
  return (
    <div>
      <div className="flex flex-col items-center gap-6 md:flex-row md:gap-2">
        <Party icon={User} title="Initiator" sub="funds the deal in escrow" delay={0} />
        <Rail hue={ACCENT} label="① funds in" />
        <Core />
        <Rail hue={CYAN} label="② sealed work" reverse />
        <Party icon={ShieldCheck} title="Committer" sub="delivers the work product" delay={1.2} />
      </div>
      <p className="mx-auto mt-8 max-w-xl text-center text-sm text-zinc-400">
        desc holds the funds, the{" "}
        <span className="text-zinc-200">AI moderator verifies the deliverable</span>{" "}
        against the agreed criteria, and the deal{" "}
        <span className="text-zinc-200">settles on the verdict</span> — released on pass,
        refunded on fail. Neither side can cheat.
      </p>
    </div>
  );
}
