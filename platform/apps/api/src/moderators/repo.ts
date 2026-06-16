import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { moderators, type ModeratorRow } from "../db/schema";

/** Public age recipients of all active moderators — what committers encrypt to. */
export async function listActiveRecipients(): Promise<string[]> {
  const rows = await db
    .select({ recipient: moderators.recipient })
    .from(moderators)
    .where(eq(moderators.active, true));
  return rows.map((r) => r.recipient);
}

/** Full registry (admin view). */
export async function listModerators(): Promise<ModeratorRow[]> {
  return db.select().from(moderators);
}

/** Register a moderator's public recipient. */
export async function addModerator(recipient: string, label: string): Promise<ModeratorRow> {
  const [row] = await db.insert(moderators).values({ recipient, label }).returning();
  return row;
}
