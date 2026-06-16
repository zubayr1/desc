import type {
  Contract,
  ContractStatus,
  DeliverableType,
  Outcome,
} from "@repo/shared";
import type { ContractRow } from "../db/schema";

/** The mutable on-chain state — supplied either from a live `readEscrow`
 *  (detail) or from the cached columns (list). `OnChainEscrow` is structurally
 *  assignable to this. */
export interface EscrowState {
  status: ContractStatus;
  committer: string | null;
  outcome: Outcome | null;
}

/** Map a DB row + escrow state into the domain `Contract`. */
export function toContract(row: ContractRow, state: EscrowState): Contract {
  return {
    id: row.id,
    contractId: row.contractId,
    status: state.status,
    initiator: row.initiator,
    committer: state.committer,
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
    outcome: state.outcome,
    deliverable:
      row.deliverableSubmittedAt && row.deliverableHash
        ? {
            deliverableHash: row.deliverableHash,
            root: row.deliverableRoot ?? "",
            fileCount: row.deliverableManifest?.files.length ?? 0,
            totalSize:
              row.deliverableManifest?.files.reduce((s, f) => s + f.size, 0) ?? 0,
            files:
              row.deliverableManifest?.files.map((f) => ({ path: f.path, size: f.size })) ?? [],
            submittedAt: row.deliverableSubmittedAt.toISOString(),
          }
        : null,
    deadline: row.deadline.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
