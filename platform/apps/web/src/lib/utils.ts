import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Truncate a pubkey for display. */
export const short = (addr: string) =>
  addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;

/** Base units (1e6) → "1,000 USDC". */
export const usd = (base: string) =>
  `${(Number(base) / 1e6).toLocaleString()} USDC`;
