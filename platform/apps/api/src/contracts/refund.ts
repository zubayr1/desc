import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { connection, program, platformConfigPda, readEscrow } from "../solana/program";
import { VOTE_COMMITTED, chainNow } from "../moderation/commit";
import { tiebreakPhase } from "../moderation/tiebreak/phase";
import { buildRefund } from "../solana/instructions/refund";
import { submitSignedTx } from "../solana/rpc";
import { toContract } from "./mapper";
import { getRow, cacheFields } from "./repo";

/** Build the unsigned `refund` tx for the initiator. Valid on a ghost-timeout
 *  (active + past deadline, no submission), a Fail, or Inconclusive — including
 *  one not yet finalized, which this transaction finalizes first. */
export async function prepareRefund(
  id: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRow(id);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  const now = Math.floor(Date.now() / 1000);
  const ghosted = oc.status === "active" && now > oc.deadline;
  const refundable = oc.status === "submitted" && (oc.outcome === "fail" || oc.outcome === "inconclusive");

  let finalize = false;
  const escrow = oc.status === "submitted" ? await program.account.escrow.fetch(new PublicKey(row.escrowAddress)) : null;
  const panel = escrow ? await program.account.panel.fetchNullable(escrow.panel) : null;
  if (escrow && panel) {
    const chain = await chainNow(connection);
    finalize = tiebreakPhase(escrow, panel, chain) === "finalize";
    const unrevealed = panel.entries.slice(0, panel.count).some((e) => e.vote === VOTE_COMMITTED);
    if (refundable && unrevealed && chain <= escrow.revealDeadline.toNumber()) {
      throw Object.assign(new Error("cannot refund yet: a moderator still has time to reveal its vote"), {
        statusCode: 409,
      });
    }
  }
  if (!ghosted && !refundable && !finalize) {
    throw Object.assign(
      new Error(
        "cannot refund: needs a ghost timeout (active, past deadline), a Fail, or an Inconclusive verdict"
      ),
      { statusCode: 409 }
    );
  }

  const cfg = await program.account.config.fetch(platformConfigPda);
  const unsignedTx = await buildRefund({
    initiator: new PublicKey(row.initiator),
    escrow: new PublicKey(row.escrowAddress),
    vault: new PublicKey(row.vaultAddress),
    treasury: cfg.treasury,
    finalize,
    // Who is paid comes from the panel, read inside the builder: every moderator
    // that voted on a Fail, nobody on a ghost-timeout.
  });
  return { id: row.id, unsignedTx };
}

/** Submit the signed `refund` tx. Ghost-timeout returns the full deposit; a Fail
 *  verdict returns it less the moderator surcharge and the verification fee. */
export async function submitRefund(
  id: string,
  signedTx: string
): Promise<Contract> {
  const row = await getRow(id);
  await submitSignedTx(signedTx);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));
  const [updated] = await db
    .update(contracts)
    .set(cacheFields(oc))
    .where(eq(contracts.id, id))
    .returning();
  return toContract(updated, oc);
}
