import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DELIVERABLE_TYPES, type DeliverableType } from "@repo/shared";
import { helperAvailable, suggestCriteria } from "../helper/criteria";

/**
 * Helper AI routes. Unauthenticated — this runs before a contract exists. The
 * rate limit is therefore the only thing between a stranger and our Claude
 * subscription, so it is the tightest in the api.
 */

const schema = z.object({
  title: z.string().trim().min(3).max(200),
  brief: z.string().trim().min(10).max(4000),
  deliverableType: z.enum(DELIVERABLE_TYPES as unknown as [string, ...string[]]),
  existing: z.array(z.string().trim().max(500)).max(10).optional(),
});

export function registerHelperRoutes(app: FastifyInstance) {
  app.get("/helper/status", async () => ({ available: helperAvailable() }));

  app.post(
    "/helper/criteria",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const body = schema.parse(req.body);
      const criteria = await suggestCriteria({
        ...body,
        deliverableType: body.deliverableType as DeliverableType,
      });
      return { criteria };
    }
  );
}
