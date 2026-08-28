import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type {
  Contract,
  CreateContractRequest,
  CreateContractResponse,
} from "@repo/shared";
import { MODERATOR_SURCHARGE_BPS, MODERATOR_COUNT } from "@repo/shared";
import { db } from "../db/client";
import { contracts } from "../db/schema";
import {
  program,
  platformConfigPda,
  usdcMint,
  escrowPda,
  vaultPda,
  readEscrow,
} from "../solana/program";
import { buildCreateEscrow } from "../solana/instructions/createEscrow";
import { submitSignedTx } from "../solana/rpc";
import { generateLinkToken } from "../links/token";
import { toContract } from "./mapper";
import { getRow, cacheFields } from "./repo";

/** Build the unsigned create_escrow tx + persist the off-chain metadata. */
export async function createContract(
  req: CreateContractRequest
): Promise<CreateContractResponse> {
  const initiator = new PublicKey(req.initiator);
  const contractIdHex = randomBytes(16).toString("hex");
  const contractIdBuf = Buffer.from(contractIdHex, "hex");
  const escrow = escrowPda(initiator, contractIdBuf);
  const vault = vaultPda(escrow);

  // Snapshot the protocol fee from the live Config (same math as the program):
  // max(bps of amount, fee floor).
  const cfg = await program.account.config.fetch(platformConfigPda);

  // Friendly early-fail before we write a draft row (the program is the real
  // guard). Below the minimum the fee floor dominates the contract.
  const minAmount = BigInt(cfg.minAmount.toString());
  if (BigInt(req.amount) < minAmount) {
    throw Object.assign(
      new Error(
        `amount is below the protocol minimum of ${Number(minAmount) / 1e6} USDC`
      ),
      { statusCode: 400 }
    );
  }

  const bpsFee = (BigInt(req.amount) * BigInt(cfg.protocolFeeBps)) / 10_000n;
  const feeMin = BigInt(cfg.protocolFeeMin.toString());
  const protocolFee = (bpsFee > feeMin ? bpsFee : feeMin).toString();
  // The floor doubles as the non-refundable verification fee — kept only once a
  // moderator has rendered a verdict. Same snapshot the program stores.
  const verificationFee = feeMin.toString();

  // V1: the moderator earns its surcharge, computed server-side (never trusted
  // from the client). `GET /config/fees` serves the same constants so the form
  // can quote the exact total the wallet will be asked to sign.
  const moderatorSurcharge = (
    (BigInt(req.amount) * BigInt(MODERATOR_SURCHARGE_BPS)) /
    10_000n
  ).toString();
  const moderatorCount = MODERATOR_COUNT;

  const criteria = req.acceptanceCriteria.map((c, i) => ({
    id: `c${i + 1}`,
    description: c.description,
  }));
  const deadline = new Date(req.deadline);

  const unsignedTx = await buildCreateEscrow({
    initiator,
    contractIdBytes: Array.from(contractIdBuf),
    escrow,
    vault,
    amount: req.amount,
    moderatorCount,
    moderatorSurcharge,
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
      verificationFee,
      moderatorSurcharge,
      moderatorCount,
      deadline,
      linkToken: null,
      initiatorRecipient: req.initiatorRecipient ?? null,
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
  await submitSignedTx(signedTx);

  const oc = await readEscrow(new PublicKey(row.escrowAddress));

  const [updated] = await db
    .update(contracts)
    .set({ linkToken: generateLinkToken(), ...cacheFields(oc) })
    .where(eq(contracts.id, id))
    .returning();

  return toContract(updated, oc);
}
