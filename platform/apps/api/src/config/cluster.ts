import "dotenv/config";
import { CLUSTERS, resolveEnv, type ClusterConfig, type DescEnv } from "@repo/shared";

/**
 * Which chain we are on, with **no secrets required**.
 *
 * Deliberately separate from `env.ts`: the server needs a database URL and a
 * config authority to start, but `bootstrap` is the script that *creates* the
 * config authority, and `moderation-init` runs before there is a database
 * worth reading. Those scripts still need the RPC, so the cluster lookup lives
 * here where nothing else is demanded of it.
 */
export const descEnv: DescEnv = resolveEnv(process.env.DESC_ENV);
export const cluster: ClusterConfig = CLUSTERS[descEnv];

/** The cluster's RPC, unless explicitly overridden (a paid endpoint, say). */
export const rpcUrl: string = process.env.RPC_URL?.trim() || cluster.rpcUrl;

/**
 * The settlement mint. Fixed and hard-coded on mainnet — that is the one value
 * a typo must not reach — and from `bootstrap` everywhere else.
 *
 * A function, not a constant: scripts that run *before* a mint exists still
 * import this module for the RPC.
 */
export function usdcMint(): string {
  const mint = cluster.usdcMint ?? process.env.USDC_MINT?.trim();
  if (!mint) {
    throw new Error(
      `USDC_MINT is not set. On ${descEnv} the mint is created by \`pnpm bootstrap\` — ` +
        "run it and copy the printed value into .env."
    );
  }
  return mint;
}
