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
 * hook here. Because nothing renders until it settles, it must ALWAYS settle:
 * it has a timeout, it never rejects, and it remembers the last answer.
 */
import { CLUSTERS, type ChainConfig } from "@repo/shared";
import { api } from "@/lib/api";

/**
 * Last resort, if the api cannot be reached and nothing was cached. Localnet,
 * because that is the only environment where the api being down is routine.
 */
const FALLBACK: ChainConfig = {
  ...CLUSTERS.local,
  // The dev mint only exists once `bootstrap` has run, and the api is the only
  // thing that knows its address.
  usdcMint: "",
};

/**
 * Nothing renders until the config arrives, so a slow api must not mean a blank
 * page for ever. Long enough for a cold server, short enough to notice.
 */
const BOOT_TIMEOUT_MS = 4000;

/**
 * The last config the api gave us, so a reload while it is down still shows the
 * right cluster instead of claiming to be on localnet. Wrapped because storage
 * throws in private mode and in some embedded browsers.
 */
const CACHE_KEY = "desc.chain";
const readCache = (): ChainConfig | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ChainConfig) : null;
  } catch {
    return null;
  }
};
const writeCache = (c: ChainConfig) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // no storage — the next boot just asks the api again
  }
};

let current: ChainConfig = readCache() ?? FALLBACK;

/**
 * Fetch the api's chain config. Called once, before the app renders.
 *
 * Never rejects and never hangs: on timeout or error it falls back to the last
 * known config, then to localnet, so the app always mounts.
 */
export async function loadChain(): Promise<ChainConfig> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), BOOT_TIMEOUT_MS);
  try {
    current = await api.get<ChainConfig>("/config/chain", { signal: abort.signal });
    writeCache(current);
  } catch {
    // api down, slow, or unreachable — render against what we already know.
  } finally {
    clearTimeout(timer);
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
