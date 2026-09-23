import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Logo";
import { chain } from "@/lib/chain";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/moderators", label: "Moderators" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contracts", label: "My contracts" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link to="/" className="flex items-center gap-2.5 text-[1.15rem] font-semibold tracking-[-0.03em]">
          <Logo className="size-7" />
          desc
        </Link>

        {/* Segmented nav: one glass capsule, the current page lifted inside it. */}
        <nav className="hidden items-center gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] p-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  "relative rounded-full px-4 py-1.5 text-sm font-medium transition",
                  isActive
                    ? "bg-gradient-to-b from-white/[0.12] to-white/[0.05] text-ink shadow-[0_0_0_1px_rgba(255,255,255,.1)_inset,0_6px_20px_-8px_rgba(139,92,255,.6)]"
                    : "text-muted hover:bg-white/[0.05] hover:text-ink"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && (
                    <span className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-accent-2 to-transparent" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <NetworkPill className="hidden sm:inline-flex" />
          <ConnectButton />
          <button
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-ink md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="grid gap-1 border-t border-white/[0.06] p-3 md:hidden">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "rounded-xl px-3 py-2.5 text-sm font-medium",
                  isActive ? "bg-white/[0.07] text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink"
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

export function NetworkPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-accent-2/30 px-2.5 py-1 font-mono text-[0.7rem] text-accent-2",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-accent-2 shadow-[0_0_10px_var(--color-accent-2)]" />
      {chain().label}
    </span>
  );
}
