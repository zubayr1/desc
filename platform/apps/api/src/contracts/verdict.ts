import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract, Outcome } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { readEscrow } from "../solana/program";
import { sendRecordVerdict } from "../solana/instructions/recordVerdict";
import { toContract } from "./mapper";
import { getRow, cacheFields } from "./repo";

/**
 * Admin / settlement-authority records the verdict (the MVP stand-in for AI
 * moderators). The API signs + sends with the hot settlement key — no user
 * wallet involved. Status stays `submitted`; only `outcome` is set, which
 * unlocks release (Pass) or refund (Fail).
 */
export async function recordVerdict(
  id: string,
  outcome: Outcome,
  note?: string
): Promise<Contract> {
  const row = await getRow(id);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  if (oc.status !== "submitted") {
    throw Object.assign(
      new Error(`cannot record verdict: escrow is ${oc.status}, not submitted`),
      { statusCode: 409 }
    );
  }

  // Audit hash of the decision record (in V1 there's no AI verdict JSON).
  const verdictHash = createHash("sha256")
    .update(JSON.stringify({ outcome, note: note ?? "" }))
    .digest();

  await sendRecordVerdict({
    escrow: new PublicKey(row.escrowAddress),
    outcome,
    verdictHashBytes: Array.from(verdictHash),
  });

  const after = await readEscrow(new PublicKey(row.escrowAddress));
  const [updated] = await db
    .update(contracts)
    .set({ verdictNote: note ?? null, ...cacheFields(after) })
    .where(eq(contracts.id, id))
    .returning();

  return toContract(updated, after);
}
