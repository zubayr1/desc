import Fastify from "fastify";
import { env } from "./config/env";
import { pool } from "./db/client";
import { program, platformConfigPda } from "./solana/program";
import { registerContractRoutes } from "./routes/contracts";
import { registerLinkRoutes } from "./routes/links";
import { registerAdminRoutes } from "./routes/admin";

const app = Fastify({ logger: true });

registerContractRoutes(app);
registerLinkRoutes(app);
registerAdminRoutes(app);

app.get("/health", async () => {
  // DB reachable?
  await pool.query("select 1");
  // Chain reachable + config present?
  const cfg = await program.account.config.fetch(platformConfigPda);
  return {
    status: "ok",
    rpc: env.RPC_URL,
    config: {
      address: platformConfigPda.toBase58(),
      authority: cfg.authority.toBase58(),
      settlementAuthority: cfg.settlementAuthority.toBase58(),
      protocolFeeBps: cfg.protocolFeeBps,
      paused: cfg.paused,
    },
  };
});

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
