import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "accent" | "outline" | "ghost";

export function Button({
  className,
  variant = "outline",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<Variant, string> = {
    accent: "btn-accent text-white font-semibold hover:brightness-110",
    outline: "border border-white/15 text-zinc-200 hover:bg-white/5",
    ghost: "text-zinc-300 hover:bg-white/5",
  };
  return <button className={cn(base, variants[variant], className)} {...props} />;
}
