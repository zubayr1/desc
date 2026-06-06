import { Link } from "react-router-dom";
import { ArrowRight, Lock, Plus, Scale, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const POINTS = [
  {
    icon: Lock,
    title: "Escrowed, not entrusted",
    sub: "funds held by the protocol — never the other party",
  },
  {
    icon: Sparkles,
    title: "AI verifies the work",
    sub: "independent AI moderators check the deliverable against your criteria",
    highlight: true,
  },
  {
    icon: Scale,
    title: "Settles on the verdict",
    sub: "released or refunded automatically — neither side can cheat",
  },
];

export function Home() {
  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-balance">
        Wrap your deal
        <br />
        in a <span className="text-gradient">layer of trust.</span>
      </h1>

      <p className="mx-auto mt-5 max-w-md text-lg text-zinc-400">
        Escrow that settles on{" "}
        <span className="text-zinc-200">AI-verified proof</span> — not promises.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {POINTS.map((p) => (
          <div
            key={p.title}
            className={cn(
              "glass flex flex-col items-start gap-3 p-5 text-left",
              p.highlight && "ring-1 ring-accent/40"
            )}
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-lg",
                p.highlight
                  ? "btn-accent text-white"
                  : "bg-white/5 text-accent-2"
              )}
            >
              <p.icon className="size-4" />
            </span>
            <div>
              <div className="text-sm font-medium text-zinc-100">{p.title}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{p.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-center gap-3">
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
    </div>
  );
}
