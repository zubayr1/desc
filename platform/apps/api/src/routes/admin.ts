import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { listContracts } from "../contracts/service";

/**
 * Bearer-token gate for /admin/*. Fail-closed: if ADMIN_TOKEN isn't configured,
 * every admin request is rejected.
 *
 * These are READ-ONLY oversight routes — the platform does not record verdicts
 * (moderators do, via `desc_moderation`). The api holds no signing key.
 */
async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return reply.code(401).send({ error: "Unauthorized — invalid admin token." });
  }
}

export function registerAdminRoutes(app: FastifyInstance) {
  // Read-only oversight: all contracts merged with live chain state.
  app.get("/admin/contracts", { preHandler: requireAdmin }, async () =>
    listContracts({})
  );
}
