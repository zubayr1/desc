import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { OUTCOMES, type Outcome } from "@repo/shared";
import { env } from "../config/env";
import { recordVerdict, listContracts } from "../contracts/service";

const verdictSchema = z.object({
  outcome: z
    .string()
    .refine((v) => (OUTCOMES as readonly string[]).includes(v), {
      message: "invalid outcome",
    }),
  note: z.string().optional(),
});

/**
 * Bearer-token gate for /admin/*. Fail-closed: if ADMIN_TOKEN isn't configured,
 * every admin request is rejected (these routes sign with the settlement key, so
 * an open door = anyone can adjudicate any contract).
 */
async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return reply.code(401).send({ error: "Unauthorized — invalid admin token." });
  }
}

export function registerAdminRoutes(app: FastifyInstance) {
  // Admin queue — all contracts merged with live chain state.
  app.get("/admin/contracts", { preHandler: requireAdmin }, async () =>
    listContracts({})
  );

  // Record the verdict — API signs with the hot settlement key (no user wallet).
  app.post(
    "/admin/contracts/:id/verdict",
    { preHandler: requireAdmin },
    async (req) => {
      const { id } = req.params as { id: string };
      const { outcome, note } = verdictSchema.parse(req.body);
      return recordVerdict(id, outcome as Outcome, note);
    }
  );
}
