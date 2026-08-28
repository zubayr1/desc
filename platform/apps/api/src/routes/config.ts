import type { FastifyInstance } from "fastify";
import type { FeeConfig } from "@repo/shared";
import { MODERATOR_SURCHARGE_BPS, MODERATOR_COUNT } from "@repo/shared";
import { listActiveRecipients } from "../solana/moderation";
import { program, platformConfigPda } from "../solana/program";

export function registerConfigRoutes(app: FastifyInstance) {
  // Public: the live fee parameters, so the UI quotes what the wallet will
  // actually be charged instead of mirroring the numbers in its own constants.
  app.get("/config/fees", async (): Promise<FeeConfig> => {
    const cfg = await program.account.config.fetch(platformConfigPda);
    return {
      protocolFeeBps: cfg.protocolFeeBps,
      protocolFeeMin: cfg.protocolFeeMin.toString(),
      minAmount: cfg.minAmount.toString(),
      moderatorSurchargeBps: MODERATOR_SURCHARGE_BPS,
      moderatorCount: MODERATOR_COUNT,
    };
  });

  // Public: the moderator recipients a committer's browser encrypts to.
  // Read from the chain — the `desc_moderation` registry is the source of truth.
  app.get("/config/moderators", async () => {
    return { recipients: await listActiveRecipients() };
  });
}
