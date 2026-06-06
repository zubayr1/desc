import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { contracts, type ContractRow } from "../db/schema";

/** All contract rows, newest first. */
export async function getAllRows(): Promise<ContractRow[]> {
  return db.select().from(contracts).orderBy(desc(contracts.createdAt));
}

/** Fetch a contract row by id, or throw a 404-tagged error. */
export async function getRow(id: string): Promise<ContractRow> {
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!row) throw Object.assign(new Error("contract not found"), { statusCode: 404 });
  return row;
}

/** Resolve a contract row by its shareable link token, or throw 404. */
export async function getRowByLink(token: string): Promise<ContractRow> {
  const [row] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.linkToken, token));
  if (!row) throw Object.assign(new Error("link not found"), { statusCode: 404 });
  return row;
}
