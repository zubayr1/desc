/**
 * Where the app points on-chain. Everything a judge might want to verify —
 * which cluster, which programs — comes from here, so the UI can link it.
 */
export const CLUSTER = (import.meta.env.VITE_CLUSTER ?? "localnet") as
  | "localnet"
  | "devnet"
  | "mainnet-beta";

export const ESCROW_PROGRAM_ID =
  import.meta.env.VITE_ESCROW_PROGRAM_ID ?? "4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU";
export const MODERATION_PROGRAM_ID =
  import.meta.env.VITE_MODERATION_PROGRAM_ID ?? "AHGBmnYQCXJwnKKPixjmt6KAbDjVpMQtETRASzycJ47T";

export const REPO_URL = "https://github.com/zubayr1/desc";

/** A Solana Explorer link for an address, on the right cluster. */
export function explorerUrl(address: string): string {
  const base = `https://explorer.solana.com/address/${address}`;
  if (CLUSTER === "mainnet-beta") return base;
  if (CLUSTER === "devnet") return `${base}?cluster=devnet`;
  return `${base}?cluster=custom&customUrl=${encodeURIComponent("http://127.0.0.1:8899")}`;
}

export const clusterLabel = CLUSTER === "mainnet-beta" ? "Mainnet" : CLUSTER === "devnet" ? "Devnet" : "Localnet";
