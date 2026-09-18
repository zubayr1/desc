import type { ReactNode } from "react";
import { Reveal } from "./landing/Reveal";
import { cn } from "@/lib/utils";

/** Eyebrow + heading + optional subline, shared by the marketing pages. */
export function SectionHead({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <Reveal className={cn("mb-10 max-w-2xl", align === "center" && "mx-auto text-center")}>
      <div className="label">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-balance md:text-[2.6rem] md:leading-[1.05]">
        {title}
      </h2>
      {sub && <p className={cn("mt-3 text-muted", align === "center" && "mx-auto max-w-xl")}>{sub}</p>}
    </Reveal>
  );
}
