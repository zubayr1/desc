import type { FastifyInstance } from "fastify";
import { listActiveRecipients } from "../moderators/repo";

export function registerConfigRoutes(app: FastifyInstance) {
  // Public: the moderator recipients a committer's browser encrypts to.
  app.get("/config/moderators", async () => {
    return { recipients: await listActiveRecipients() };
  });
}
