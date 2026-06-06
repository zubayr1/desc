import type { Contract, DeliverableType } from "@repo/shared";
import type { ContractRow } from "../db/schema";
import type { OnChainEscrow } from "../solana/program";

/** Map a DB row + live on-chain escrow into the domain `Contract`. */
export function toContract(row: ContractRow, oc: OnChainEscrow): Contract {
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
    // Shown only once the submit tx has confirmed (submittedAt set), even though
    // payload + hash are stashed at prepare time.
    deliverable: row.deliverableSubmittedAt
      ? {
          payload: row.deliverablePayload ?? "",
          deliverableHash: row.deliverableHash ?? "",
          submittedAt: row.deliverableSubmittedAt.toISOString(),
        }
      : null,
    deadline: row.deadline.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
