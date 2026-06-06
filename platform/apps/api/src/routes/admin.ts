import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OUTCOMES, type Outcome } from "@repo/shared";
import { recordVerdict, listContracts } from "../contracts/service";

const verdictSchema = z.object({
  outcome: z
    .string()
    .refine((v) => (OUTCOMES as readonly string[]).includes(v), {
      message: "invalid outcome",
    }),
  note: z.string().optional(),
});

export function registerAdminRoutes(app: FastifyInstance) {
  // Admin queue — all contracts merged with live chain state.
  app.get("/admin/contracts", async () => listContracts());

  // Record the verdict — API signs with the hot settlement key (no user wallet).
  app.post("/admin/contracts/:id/verdict", async (req) => {
    const { id } = req.params as { id: string };
    const { outcome, note } = verdictSchema.parse(req.body);
    return recordVerdict(id, outcome as Outcome, note);
  });
}
