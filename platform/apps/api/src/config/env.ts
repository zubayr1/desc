import "dotenv/config";
import { homedir } from "node:os";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  RPC_URL: z.string().min(1).default("http://127.0.0.1:8899"),
  DATABASE_URL: z.string().min(1),
  /** Cold admin authority PUBKEY — seeds the Config PDA. No secret needed here;
   *  the api never signs admin (update_config) actions. */
  CONFIG_AUTHORITY: z.string().min(1),
  /** Path to the HOT settlement keypair — the only key the api signs with
   *  (used solely for `record_verdict`). */
  SETTLEMENT_KEYPAIR_PATH: z.string().min(1),
  /** USDC mint the platform settles in (created by the bootstrap script on localnet). */
  USDC_MINT: z.string().min(1),
  /** Bearer token gating the /admin/* routes. If unset, admin is fail-closed
   *  (every admin request is rejected). Set a long random value in prod. */
  ADMIN_TOKEN: z.string().min(1).optional(),
  /** Local object-storage dir for deliverable bundles (dev). Swap for S3/R2. */
  STORAGE_DIR: z.string().default("./storage"),
});

export const env = schema.parse(process.env);

/** Expand a leading `~` to the home directory. */
export const expandHome = (p: string) =>
  p.startsWith("~") ? p.replace(/^~/, homedir()) : p;
