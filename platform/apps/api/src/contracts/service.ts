import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type {
  Contract,
  CreateContractRequest,
  CreateContractResponse,
  DeliverableType,
} from "@repo/shared";
import { db } from "../db/client";
import { contracts, type ContractRow } from "../db/schema";
import {
  program,
  platformConfigPda,
  usdcMint,
  escrowPda,
  vaultPda,
  readEscrow,
  type OnChainEscrow,
} from "../solana/program";
import { buildCreateEscrowTx, submitSigned } from "../solana/tx";
import { generateLinkToken } from "../links/token";

/** Map a DB row + live on-chain escrow into the domain `Contract`. */
function toContract(row: ContractRow, oc: OnChainEscrow): Contract {
  return {
    id: row.id,
    contractId: row.contractId,
    status: oc.status,
    initiator: row.initiator,
    committer: oc.committer,
    title: row.title,
    brief: row.brief,
    deliverableType: row.deliverableType as DeliverableType,
    acceptanceCriteria: row.acceptanceCriteria,
    mint: row.mint,
    amount: row.amount,
    protocolFee: row.protocolFee,
    moderatorSurcharge: row.moderatorSurcharge,
    moderatorCount: row.moderatorCount,
    escrowAddress: row.escrowAddress,
    vaultAddress: row.vaultAddress,
    linkToken: row.linkToken,
    outcome: oc.outcome,
    deliverable: row.deliverablePayload
      ? {
          payload: row.deliverablePayload,
          deliverableHash: row.deliverableHash ?? "",
          submittedAt: (row.deliverableSubmittedAt ?? new Date()).toISOString(),
        }
      : null,
    deadline: row.deadline.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getRow(id: string): Promise<ContractRow> {
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!row) throw Object.assign(new Error("contract not found"), { statusCode: 404 });
  return row;
}

/** Build the unsigned create_escrow tx + persist the off-chain metadata. */
export async function createContract(
  req: CreateContractRequest
): Promise<CreateContractResponse> {
  const initiator = new PublicKey(req.initiator);
  const contractIdHex = randomBytes(16).toString("hex");
  const contractIdBuf = Buffer.from(contractIdHex, "hex");
  const escrow = escrowPda(initiator, contractIdBuf);
  const vault = vaultPda(escrow);

  // Snapshot the protocol fee from the live Config (same math as the program).
  const cfg = await program.account.config.fetch(platformConfigPda);
  const protocolFee = (
    (BigInt(req.amount) * BigInt(cfg.protocolFeeBps)) /
    10_000n
  ).toString();

  const criteria = req.acceptanceCriteria.map((c, i) => ({
    id: `c${i + 1}`,
    description: c.description,
  }));
  const deadline = new Date(req.deadline);

  const unsignedTx = await buildCreateEscrowTx({
    initiator,
    contractIdBytes: Array.from(contractIdBuf),
    escrow,
    vault,
    amount: req.amount,
    moderatorCount: req.moderatorCount,
    moderatorSurcharge: req.moderatorSurcharge,
    deadlineUnix: Math.floor(deadline.getTime() / 1000),
  });

  const [row] = await db
    .insert(contracts)
    .values({
      contractId: contractIdHex,
      escrowAddress: escrow.toBase58(),
      vaultAddress: vault.toBase58(),
      initiator: req.initiator,
      title: req.title,
      brief: req.brief,
      deliverableType: req.deliverableType,
      acceptanceCriteria: criteria,
      mint: usdcMint.toBase58(),
      amount: req.amount,
      protocolFee,
      moderatorSurcharge: req.moderatorSurcharge,
      moderatorCount: req.moderatorCount,
      deadline,
      linkToken: null,
    })
    .returning();

  return {
    id: row.id,
    contractId: contractIdHex,
    escrowAddress: escrow.toBase58(),
    unsignedTx,
  };
}

/** Submit the signed create_escrow tx, confirm it funded, mint the link token. */
export async function submitContract(
  id: string,
  signedTx: string
): Promise<Contract> {
  const row = await getRow(id);
  await submitSigned(signedTx);

  // Confirm the escrow now exists + is funded on-chain.
  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  const [updated] = await db
    .update(contracts)
    .set({ linkToken: generateLinkToken(), updatedAt: new Date() })
    .where(eq(contracts.id, id))
    .returning();

  return toContract(updated, oc);
}

/** Merged read: DB metadata + live chain state. */
export async function getContract(id: string): Promise<Contract | null> {
  const row = await getRow(id);
  try {
    const oc = await readEscrow(new PublicKey(row.escrowAddress));
    return toContract(row, oc);
  } catch {
    // Escrow account not on-chain yet → not funded (POST /contracts without submit).
    return null;
  }
}
