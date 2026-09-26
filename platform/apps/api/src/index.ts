import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { cluster, env } from "./config/env";
import { pool } from "./db/client";
import { program, platformConfigPda } from "./solana/program";
import { registerContractRoutes } from "./routes/contracts";
import { registerLinkRoutes } from "./routes/links";
import { registerAdminRoutes } from "./routes/admin";
import { registerConfigRoutes } from "./routes/config";
import { humanizeError } from "./errors";
import { startReconciler } from "./contracts/reconciler";
import { describe as describeStorage } from "./storage";

const app = Fastify({ logger: true });

// Allow the web/admin frontends (different origin) to call the api.
//
// `CORS_ORIGIN` is a comma-separated allow-list. Unset reflects whatever origin
// asks, which is convenient locally and wrong once the api is on the internet:
// set it to the deployed frontend's URL.
const corsOrigins = env.CORS_ORIGIN?.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
await app.register(cors, { origin: corsOrigins?.length ? corsOrigins : true });

// Basic DoS guard: per-IP request cap. Default applies to every route; the
// draft-creating POST /contracts gets a tighter override (see routes/contracts).
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

// Full error to the logs; a clean `{ error }` message to the client.
app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  const { status, message } = humanizeError(err);
  reply.code(status).send({ error: message });
});

registerContractRoutes(app);
registerLinkRoutes(app);
registerAdminRoutes(app);
registerConfigRoutes(app);

/**
 * Liveness: is the process up?
 *
 * Deliberately dependency-free. Hosting platforms poll a health path and refuse
 * to route traffic — or roll the deploy back — when it fails, so a probe that
 * touches the database and the chain would mark the api dead over a slow RPC or
 * a database still waking. Worse, it would fail before `bootstrap` has run,
 * making a first deploy impossible. `/health/deep` is the one that checks
 * everything, for humans.
 */
app.get("/health", async () => ({
  status: "ok",
  env: cluster.env,
  storage: describeStorage(),
}));

app.get("/health/deep", async () => {
  // DB reachable?
  await pool.query("select 1");
  // Chain reachable + config present?
  const cfg = await program.account.config.fetch(platformConfigPda);
  return {
    status: "ok",
    env: cluster.env,
    rpc: env.RPC_URL,
    storage: describeStorage(),
    config: {
      address: platformConfigPda.toBase58(),
      authority: cfg.authority.toBase58(),
      settlementAuthority: cfg.settlementAuthority.toBase58(),
      protocolFeeBps: cfg.protocolFeeBps,
      protocolFeeMin: cfg.protocolFeeMin.toString(),
      minAmount: cfg.minAmount.toString(),
      paused: cfg.paused,
    },
  };
});

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });

    // Catch settlements and verdicts that never went through this api.
    if (env.RECONCILE_INTERVAL_MS > 0) {
      startReconciler({ intervalMs: env.RECONCILE_INTERVAL_MS, log: app.log });
      app.log.info(
        { intervalMs: env.RECONCILE_INTERVAL_MS },
        "reconciler started"
      );
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
