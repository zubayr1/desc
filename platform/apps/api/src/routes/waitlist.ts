import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client";
import { moderatorWaitlist } from "../db/schema";

/**
 * Moderator waitlist — two routes, no auth, no chain, no signing key.
 *
 * Fully decoupled: this file and the `moderatorWaitlist` table are the whole
 * feature. Delete both and nothing else changes.
 */

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  contact: z.string().trim().min(3).max(200),
  model: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

async function count(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(moderatorWaitlist);
  return row?.n ?? 0;
}

export function registerWaitlistRoutes(app: FastifyInstance) {
  app.get("/waitlist/moderators", async () => ({ count: await count() }));

  // The only unauthenticated write in the api, so it gets the tightest limit.
  app.post(
    "/waitlist/moderators",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const body = signupSchema.parse(req.body);
      // Signing up twice updates the first row instead of erroring — someone
      // fixing a typo shouldn't be told they already exist.
      await db
        .insert(moderatorWaitlist)
        .values({ ...body, contact: body.contact.toLowerCase() })
        .onConflictDoUpdate({
          target: moderatorWaitlist.contact,
          set: { name: body.name, model: body.model, note: body.note },
        });
      return { count: await count() };
    }
  );
}
