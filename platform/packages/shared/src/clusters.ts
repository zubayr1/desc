/**
 * Which chain the whole platform points at, keyed by one variable.
 *
 * Switching between local, devnet and mainnet used to mean editing eight
 * values by hand across the api, the moderators and the web — RPC, mint,
 * authority, program ids, judge, and so on. Nearly all of them are public
 * facts about a cluster rather than secrets, so they live here, in version
 * control, where a wrong mainnet mint is a reviewable diff instead of a typo
 * someone makes at 2am.
 *
 * `.env` keeps only what is genuinely secret or genuinely per-machine: the
 * database URL, the admin token, keypair paths, and the dev mint that does not
 * exist until `bootstrap` creates it.
 */

export const DESC_ENVS = ["local", "devnet", "mainnet"] as const;
export type DescEnv = (typeof DESC_ENVS)[number];

export interface ClusterConfig {
  env: DescEnv;
  /** Solana's own name for the cluster — what explorers and wallets expect. */
  cluster: "localnet" | "devnet" | "mainnet-beta";
  /** Shown in the UI. */
  label: string;
  /** Default RPC. `RPC_URL` overrides it — a paid endpoint on mainnet, say. */
  rpcUrl: string;
  escrowProgramId: string;
  moderationProgramId: string;
  /**
   * The settlement mint, where it is a fixed public fact.
   *
   * `null` on local and devnet: there is no real USDC there, so `bootstrap`
   * creates a dev mint and its address goes in `.env`. On mainnet it is the
   * one real USDC and must never come from an environment variable — that is
   * exactly the value you do not want a typo in.
   */
  usdcMint: string | null;
  /** True where deliberately-wrong test moderators may run at all. */
  allowsTestModerators: boolean;
}

/** Canonical USDC on Solana mainnet. */
const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// The programs deploy under the same keypairs everywhere today, so the ids do
// not vary. They are listed per cluster anyway: the day one differs, this is
// the file that changes, and nothing else has to know.
const ESCROW_PROGRAM_ID = "4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU";
const MODERATION_PROGRAM_ID = "AHGBmnYQCXJwnKKPixjmt6KAbDjVpMQtETRASzycJ47T";

export const CLUSTERS: Record<DescEnv, ClusterConfig> = {
  local: {
    env: "local",
    cluster: "localnet",
    label: "Localnet",
    rpcUrl: "http://127.0.0.1:8899",
    escrowProgramId: ESCROW_PROGRAM_ID,
    moderationProgramId: MODERATION_PROGRAM_ID,
    usdcMint: null,
    allowsTestModerators: true,
  },
  devnet: {
    env: "devnet",
    cluster: "devnet",
    label: "Devnet",
    rpcUrl: "https://api.devnet.solana.com",
    escrowProgramId: ESCROW_PROGRAM_ID,
    moderationProgramId: MODERATION_PROGRAM_ID,
    usdcMint: null,
    allowsTestModerators: true,
  },
  mainnet: {
    env: "mainnet",
    cluster: "mainnet-beta",
    label: "Mainnet",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    escrowProgramId: ESCROW_PROGRAM_ID,
    moderationProgramId: MODERATION_PROGRAM_ID,
    usdcMint: MAINNET_USDC,
    allowsTestModerators: false,
  },
};

/** Parse a `DESC_ENV` value, defaulting to `local`. Throws on anything else. */
export function resolveEnv(value: string | undefined): DescEnv {
  const v = (value ?? "local").trim().toLowerCase();
  if ((DESC_ENVS as readonly string[]).includes(v)) return v as DescEnv;
  throw new Error(
    `DESC_ENV must be one of ${DESC_ENVS.join(" | ")} — got "${value}"`
  );
}

/** A Solana Explorer link for an address on the given cluster. */
export function explorerUrl(address: string, c: ClusterConfig): string {
  const base = `https://explorer.solana.com/address/${address}`;
  if (c.cluster === "mainnet-beta") return base;
  if (c.cluster === "devnet") return `${base}?cluster=devnet`;
  return `${base}?cluster=custom&customUrl=${encodeURIComponent(c.rpcUrl)}`;
}
