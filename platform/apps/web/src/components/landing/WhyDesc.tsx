import { Check } from "lucide-react";

/** The hero's right side: what desc actually gives the two parties. */
const POINTS = [
  { t: "Trust the contract, not the stranger", d: "A Solana program holds the payment — neither party does." },
  { t: "AI moderators check the real work", d: "Delivered files are judged against the criteria you both agreed." },
  { t: "Decentralised conflict resolution", d: "The verdict comes from a moderator you pick, not from either side." },
  { t: "Pays out on its own", d: "Pass pays the committer, fail refunds the initiator. No chasing." },
  { t: "Private delivery", d: "Encrypted in your browser — only the moderator and you can open it." },
  { t: "Fair when it falls through", d: "Never delivered? Nothing is charged." },
];

export function WhyDesc() {
  return (
    <div
      className="relative rounded-[1.4rem] border border-white/[0.1] p-6 backdrop-blur-2xl md:p-7"
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,.04), rgba(255,255,255,.01))",
        boxShadow: "0 30px 90px -45px rgba(139,92,255,.45)",
      }}
    >
      {/* gradient hairline border */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[inherit] p-px"
        style={{
          background: "linear-gradient(140deg, rgba(139,92,255,.6), transparent 35%, transparent 65%, rgba(54,224,211,.6))",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <div className="label">What desc gives you</div>
      <ul className="mt-5 space-y-4">
        {POINTS.map((p) => (
          <li key={p.t} className="flex gap-3.5">
            <span className="btn-accent mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <div>
              <div className="font-semibold tracking-[-0.02em]">{p.t}</div>
              <div className="mt-0.5 text-sm text-muted">{p.d}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
