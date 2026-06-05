import "dotenv/config";
import { homedir } from "node:os";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  RPC_URL: z.string().default("http://127.0.0.1:8899"),
  DATABASE_URL: z.string(),
  /** Path to the platform keypair (both Config authority and settlement authority in the MVP). */
  PLATFORM_KEYPAIR_PATH: z.string(),
  /** USDC mint the platform settles in (created by the bootstrap script on localnet). */
  USDC_MINT: z.string(),
});

const parsed = schema.parse(process.env);

/** Expand a leading `~` to the home directory. */
export const expandHome = (p: string) =>
  p.startsWith("~") ? p.replace(/^~/, homedir()) : p;

export const env = parsed;
