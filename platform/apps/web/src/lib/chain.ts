/**
 * Where the app points on-chain — fetched from the api at boot, not baked in.
 *
 * This used to be four `VITE_` variables. Vite resolves those at BUILD time, so
 * switching environments meant editing them and rebuilding, and a frontend
 * built for one cluster could silently be served against another. The api
 * already knows which chain it is on (`DESC_ENV`), so it just says so, and the
 * frontend follows a single source of truth.
 *
 * `loadChain()` runs once before React renders — the wallet adapter needs the
 * RPC endpoint on its very first render, so there is no getting away with a
 * hook here.
 */
import { CLUSTERS, type ChainConfig } from "@repo/shared";
import { api } from "@/lib/api";

/**
 * Used only if the api cannot be reached at boot, so the page renders something
 * instead of a blank screen. Localnet, because that is the only environment
 * where the api being down is routine.
 */
const FALLBACK: ChainConfig = {
  ...CLUSTERS.local,
  // The dev mint only exists once `bootstrap` has run, and the api is the only
  // thing that knows its address.
  usdcMint: "",
};

let current: ChainConfig = FALLBACK;

/** Fetch the api's chain config. Called once, before the app renders. */
export async function loadChain(): Promise<ChainConfig> {
  try {
    current = await api.get<ChainConfig>("/config/chain");
  } catch {
    // api down — render against the fallback rather than not at all.
  }
  return current;
}

/** The chain the api is on. Populated by `loadChain()`. */
export const chain = (): ChainConfig => current;

export const REPO_URL = "https://github.com/zubayr1/desc";

/** A Solana Explorer link for an address, on the right cluster. */
export function explorerUrl(address: string): string {
  const c = current;
  const base = `https://explorer.solana.com/address/${address}`;
  if (c.cluster === "mainnet-beta") return base;
  if (c.cluster === "devnet") return `${base}?cluster=devnet`;
  return `${base}?cluster=custom&customUrl=${encodeURIComponent(c.rpcUrl)}`;
}
