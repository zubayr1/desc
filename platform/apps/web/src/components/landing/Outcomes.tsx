/** Where the money goes in each ending — the part judges ask about first. */
const CASES = [
  { tag: "PASS", big: "100%", who: "of the amount to the committer", mod: "its fee", proto: "its fee", tone: "pass" },
  { tag: "FAIL", big: "Refund", who: "to the initiator, minus the check", mod: "its fee", proto: "check fee only", tone: "fail" },
  { tag: "NEVER DELIVERED", big: "100%", who: "back to the initiator", mod: "nothing", proto: "nothing", tone: "ghost" },
] as const;

const TAG = {
  pass: "border-pass/30 bg-pass/10 text-pass",
  fail: "border-fail/30 bg-fail/[0.08] text-fail",
  ghost: "border-white/[0.08] bg-white/5 text-zinc-300",
};

export function Outcomes() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CASES.map((c) => (
        <div
          key={c.tag}
          className={"glass p-5 " + (c.tone === "pass" ? "shadow-[0_20px_60px_-40px_rgba(56,211,159,.6)]" : "")}
        >
          <span className={"rounded-full border px-2.5 py-1 font-mono text-[0.66rem] font-semibold tracking-[0.1em] " + TAG[c.tone]}>
            {c.tag}
          </span>
          <div className="mt-5 text-5xl font-semibold tracking-[-0.05em]">{c.big}</div>
          <div className="mt-1.5 text-sm text-muted">{c.who}</div>
          <dl className="mt-5 space-y-1.5 border-t border-white/[0.07] pt-3.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Moderator</dt>
              <dd className="font-mono">{c.mod}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Protocol</dt>
              <dd className="font-mono">{c.proto}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
