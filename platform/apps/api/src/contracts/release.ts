import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Contract } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import { program, platformConfigPda, readEscrow } from "../solana/program";
import { buildRelease } from "../solana/instructions/release";
import { submitSignedTx } from "../solana/rpc";
import { toContract } from "./mapper";
import { getRow, cacheFields } from "./repo";

/** Build the unsigned `release` tx. Signed by either party; requires a Pass
 *  verdict. Committer + treasury are read from chain/Config, not the client. */
export async function prepareRelease(
  id: string,
  signer: string
): Promise<{ id: string; unsignedTx: string }> {
  const row = await getRow(id);
  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  // Friendly early-fail (the program is the real guard).
  if (oc.status !== "submitted") {
    throw Object.assign(
      new Error(`cannot release: escrow is ${oc.status}, not submitted`),
      { statusCode: 409 }
    );
  }
  if (oc.outcome !== "pass") {
    throw Object.assign(new Error("cannot release: verdict is not Pass"), {
      statusCode: 409,
    });
  }
  if (!oc.committer) {
    throw Object.assign(new Error("no committer bound"), { statusCode: 409 });
  }
  // A no-mod escrow passes on submit with no moderator, so only require one when
  // the contract was actually moderated.
  if (!oc.noMod && !oc.moderator) {
    throw Object.assign(new Error("no moderator on record for this verdict"), {
      statusCode: 409,
    });
  }
  if (signer !== row.initiator && signer !== oc.committer) {
    throw Object.assign(
      new Error("signer must be the initiator or committer"),
      { statusCode: 400 }
    );
  }

  const cfg = await program.account.config.fetch(platformConfigPda);
  const unsignedTx = await buildRelease({
    signer: new PublicKey(signer),
    committer: new PublicKey(oc.committer),
    moderator: oc.moderator ? new PublicKey(oc.moderator) : undefined,
    escrow: new PublicKey(row.escrowAddress),
    vault: new PublicKey(row.vaultAddress),
    treasury: cfg.treasury,
    initiator: new PublicKey(row.initiator),
  });
  return { id: row.id, unsignedTx };
}

/** Submit the signed `release` tx; escrow settles → committer + treasury paid. */
export async function submitRelease(
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
