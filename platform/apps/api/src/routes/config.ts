import type { FastifyInstance } from "fastify";
import type { ChainConfig, FeeConfig } from "@repo/shared";
import { listActiveRecipients, listModeratorOffers } from "../solana/moderation";
import { program, platformConfigPda } from "../solana/program";
import { cluster, env } from "../config/env";

export function registerConfigRoutes(app: FastifyInstance) {
  // Public: which chain this api is pointing at. The web reads it at boot
  // rather than keeping its own build-time copy, so switching environments is
  // one variable here and the frontend follows.
  app.get("/config/chain", async (): Promise<ChainConfig> => ({
    env: cluster.env,
    cluster: cluster.cluster,
    label: cluster.label,
    rpcUrl: env.RPC_URL,
    usdcMint: env.USDC_MINT,
    escrowProgramId: cluster.escrowProgramId,
    moderationProgramId: cluster.moderationProgramId,
  }));

  // Public: the live fee parameters, so the UI quotes what the wallet will
  // actually be charged instead of mirroring the numbers in its own constants.
  app.get("/config/fees", async (): Promise<FeeConfig> => {
    const [cfg, moderators] = await Promise.all([
      program.account.config.fetch(platformConfigPda),
      listModeratorOffers(),
    ]);
    return {
      protocolFeeBps: cfg.protocolFeeBps,
      protocolFeeMin: cfg.protocolFeeMin.toString(),
      minAmount: cfg.minAmount.toString(),
      // Each moderator's own price, read from its on-chain account — not a
      // protocol constant. The create path reads the same accounts.
      moderators,
    };
  });

  // Public: the moderator recipients a committer's browser encrypts to.
  // Read from the chain — the `desc_moderation` registry is the source of truth.
  app.get("/config/moderators", async () => {
    return { recipients: await listActiveRecipients() };
  });
}
