import "dotenv/config";
import { homedir } from "node:os";
import { z } from "zod";
import { cluster, descEnv, rpcUrl, usdcMint } from "./cluster";

/**
 * Configuration = one variable plus secrets.
 *
 * `DESC_ENV` selects a cluster, and everything public about that cluster — RPC,
 * program ids, the settlement mint on mainnet — is looked up from the table in
 * `@repo/shared`. Only what is genuinely secret or genuinely per-machine stays
 * in `.env`. Switching to devnet is one line, not eight.
 *
 * Anything here may still be overridden explicitly: a paid RPC on mainnet, a
 * different port, a dev mint that did not exist until `bootstrap` ran.
 */
const schema = z.object({
  /** Which chain everything points at: local | devnet | mainnet. */
  DESC_ENV: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  /** Background reconciler sweep interval, ms. 0 disables it. */
  RECONCILE_INTERVAL_MS: z.coerce.number().default(30_000),
  /** Overrides the cluster's default RPC — a paid endpoint, or a local port. */
  RPC_URL: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  /** Cold admin authority PUBKEY — seeds the Config PDA. No secret needed here;
   *  the api never signs admin (update_config) actions. */
  CONFIG_AUTHORITY: z.string().min(1),
  /** The settlement mint. Required on local and devnet, where `bootstrap`
   *  creates a dev mint; ignored on mainnet, which uses the real USDC from the
   *  cluster table rather than trusting an environment variable. */
  USDC_MINT: z.string().min(1).optional(),
  /** Bearer token gating the /admin/* routes. If unset, admin is fail-closed
   *  (every admin request is rejected). Set a long random value in prod. */
  ADMIN_TOKEN: z.string().min(1).optional(),
  /**
   * Where deliverable bundles are stored.
   *
   * `fs` is the local filesystem — fine on a dev box or a server with a real
   * disk. On a container platform the filesystem is ephemeral, so a restart
   * would silently lose every deliverable and moderators would have nothing to
   * judge: use `s3` there.
   */
  STORAGE_DRIVER: z.enum(["fs", "s3"]).default("fs"),
  /** `fs` driver: where the bundles go. */
  STORAGE_DIR: z.string().default("./storage"),
  /** `s3` driver: any S3-compatible endpoint (R2, S3, B2, MinIO). */
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** R2 ignores it, but SigV4 must still sign a region. */
  S3_REGION: z.string().default("auto"),
  /** Browser origins allowed to call the api. Comma-separated; unset reflects
   *  any origin, which is right for local development and wrong in production. */
  CORS_ORIGIN: z.string().optional(),
  /** Moderator slugs that submit the OPPOSITE verdict. See judge/mischief.ts. */
  DESC_MISCHIEF_MODS: z.string().optional(),
  /** claude | claude-api | anything else (manual). See moderation/judge. */
  DESC_JUDGE: z.string().optional(),
});

const raw = schema.parse(process.env);

export { cluster, descEnv } from "./cluster";

/**
 * Refuse to start rather than run a wrong-environment configuration.
 *
 * These are the mistakes that are cheap to make and expensive to discover:
 * pointing at mainnet with a moderator that deliberately returns wrong
 * verdicts, or with a judge that never actually judges. A process that will not
 * boot is a far better outcome than one that settles real money incorrectly.
 */
function assertSafe() {
  if (cluster.allowsTestModerators) return;

  if (raw.DESC_MISCHIEF_MODS?.trim()) {
    throw new Error(
      `DESC_ENV=${descEnv} with DESC_MISCHIEF_MODS="${raw.DESC_MISCHIEF_MODS}" — ` +
        "those moderators submit the OPPOSITE verdict. Refusing to start."
    );
  }
  if (raw.DESC_JUDGE !== "claude" && raw.DESC_JUDGE !== "claude-api") {
    throw new Error(
      `DESC_ENV=${descEnv} needs DESC_JUDGE=claude or claude-api — got ` +
        `"${raw.DESC_JUDGE ?? "unset"}", which settles contracts by hand.`
    );
  }
  if (raw.USDC_MINT && raw.USDC_MINT !== cluster.usdcMint) {
    throw new Error(
      `DESC_ENV=${descEnv} settles in ${cluster.usdcMint}; USDC_MINT is set to ` +
        `${raw.USDC_MINT}. Remove it — the mint is not an environment variable here.`
    );
  }
}
assertSafe();

/**
 * A half-configured object store fails at the worst moment — when a committer
 * uploads a deliverable, long after the deploy looked healthy. Check it at
 * startup instead.
 */
if (raw.STORAGE_DRIVER === "s3") {
  const missing = (
    ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const
  ).filter((k) => !raw[k]);
  if (missing.length) {
    throw new Error(
      `STORAGE_DRIVER=s3 needs ${missing.join(", ")} — set them or use STORAGE_DRIVER=fs.`
    );
  }
}

export const env = {
  ...raw,
  RPC_URL: rpcUrl,
  USDC_MINT: usdcMint(),
};

/** Expand a leading `~` to the home directory. */
export const expandHome = (p: string) =>
  p.startsWith("~") ? p.replace(/^~/, homedir()) : p;
