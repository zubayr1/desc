import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { contracts, type ContractRow } from "../db/schema";

/** Fetch a contract row by id, or throw a 404-tagged error. */
export async function getRow(id: string): Promise<ContractRow> {
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!row) throw Object.assign(new Error("contract not found"), { statusCode: 404 });
  return row;
}
