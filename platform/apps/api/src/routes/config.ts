import type { FastifyInstance } from "fastify";
import { listActiveRecipients } from "../solana/moderation";

export function registerConfigRoutes(app: FastifyInstance) {
  // Public: the moderator recipients a committer's browser encrypts to.
  // Read from the chain — the `desc_moderation` registry is the source of truth.
  app.get("/config/moderators", async () => {
    return { recipients: await listActiveRecipients() };
  });
}
