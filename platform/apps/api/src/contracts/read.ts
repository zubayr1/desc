import { PublicKey } from "@solana/web3.js";
import type {
  Contract,
  ContractModerator,
  ContractPage,
  ContractStatus,
} from "@repo/shared";
import type { ContractRow } from "../db/schema";
import {
  readEscrow,
  readEscrows,
  readPanel,
  readPanels,
  type OnChainEscrow,
  type PanelSeat,
} from "../solana/program";
import { toContract } from "./mapper";
import {
  getRow,
  getRowByLink,
  getRows,
  getRowsPage,
  writeCache,
  writePanelVotes,
} from "./repo";

/** Final states — never change, so never re-read them. */
const TERMINAL: ReadonlySet<ContractStatus> = new Set([
  "settled",
  "refunded",
  "cancelled",
]);

/**
 * Overlay live panel votes onto the stored seats.
 *
 * Returns the merged seats and whether anything changed — a changed panel is
 * written back, because the panel account is closed on settle and the votes are
 * unreadable after that. Seats keep their cached vote when the live read has
 * nothing for them, so a settled contract still shows who said what.
 */
function overlayVotes(
  stored: ContractModerator[],
  live: PanelSeat[] | undefined
): { seats: ContractModerator[]; changed: boolean } {
  if (!live?.length) return { seats: stored, changed: false };
  const byWallet = new Map(live.map((s) => [s.moderator.toBase58(), s.vote]));
  let changed = false;
  const seats = stored.map((m) => {
    const vote = byWallet.get(m.wallet);
    if (vote === undefined || vote === m.vote) return m;
    changed = true;
    return { ...m, vote };
  });
  return { seats, changed };
}

/** Detail read: live chain state. Null if the escrow isn't on-chain yet. */
async function merge(row: ContractRow): Promise<Contract | null> {
  const escrow = new PublicKey(row.escrowAddress);
  let oc: OnChainEscrow;
  try {
    oc = await readEscrow(escrow);
  } catch {
    return null;
  }
  const contract = toContract(row, oc);

  // Overlay each seat's live vote and cache anything new. Best-effort: once the
  // contract settles the panel account is gone, and the read simply falls back
  // to the votes cached on the way there.
  try {
    const { seats, changed } = overlayVotes(contract.panel, await readPanel(escrow));
    contract.panel = seats;
    if (changed) await writePanelVotes(row.id, seats);
  } catch {
    // no panel on chain (settled, or created before panels existed)
  }
  return contract;
}

export async function getContract(id: string): Promise<Contract | null> {
  return merge(await getRow(id));
}

export async function getContractByLink(
  token: string
): Promise<Contract | null> {
  return merge(await getRowByLink(token));
}

/**
 * List read with reconcile-on-read: refresh the **non-terminal** rows from chain
 * in one batched call so the list reflects direct-to-chain txns and `mod-run`
 * verdicts that bypass the write-through cache, write back any drift, and return
 * the fresh state. Fail-safe: any RPC error falls back to the cached columns, so
 * the list degrades but never errors.
 */
/**
 * Re-read the given rows from chain and write back anything that drifted.
 * Returns the fresh state per row id so a caller can serve it immediately.
 *
 * Shared by the list route and the background reconciler — one definition of
 * "what counts as drift" so the two can never disagree.
 */
export async function reconcileRows(
  rows: ContractRow[]
): Promise<{ fresh: Map<string, OnChainEscrow>; updated: number }> {
  const fresh = new Map<string, OnChainEscrow>();
  let updated = 0;

  const inflight = rows.filter((r) => !TERMINAL.has(r.status as ContractStatus));
  if (!inflight.length) return { fresh, updated };

  const live = await readEscrows(inflight.map((r) => new PublicKey(r.escrowAddress)));

  // Votes have to be caught BEFORE settlement — `release` / `refund` close the
  // panel and take the votes with it. The sweep is the only thing guaranteed to
  // look; a contract nobody opens would otherwise settle with its breakdown
  // unrecorded. Only contracts actually awaiting a verdict are read.
  const awaiting = inflight.filter(
    (r) => live.get(r.escrowAddress)?.status === "submitted" && r.panel?.length
  );
  let panels = new Map<string, PanelSeat[]>();
  if (awaiting.length) {
    try {
      panels = await readPanels(awaiting.map((r) => new PublicKey(r.escrowAddress)));
    } catch {
      // panels unreadable this sweep — the next one tries again
    }
  }

  const writes: Promise<void>[] = [];
  for (const r of inflight) {
    const oc = live.get(r.escrowAddress);
    if (!oc) continue; // not on-chain (yet) — keep cached
    fresh.set(r.id, oc);
    if (
      oc.status !== r.status ||
      oc.committer !== r.committer ||
      oc.outcome !== r.outcome
    ) {
      writes.push(writeCache(r.id, oc));
      updated++;
    }
    const votes = overlayVotes(r.panel ?? [], panels.get(r.escrowAddress));
    if (votes.changed) writes.push(writePanelVotes(r.id, votes.seats));
  }
  if (writes.length) await Promise.all(writes);
  return { fresh, updated };
}

/** Merge rows with live chain state, falling back to the cache if RPC is down. */
async function withChainState(rows: ContractRow[]): Promise<Contract[]> {
  let fresh = new Map<string, OnChainEscrow>();
  try {
    ({ fresh } = await reconcileRows(rows));
  } catch {
    // RPC unreachable — fall through to the cached state below.
  }
  return rows.map((row) =>
    toContract(
      row,
      fresh.get(row.id) ?? {
        status: row.status as ContractStatus,
        committer: row.committer,
        outcome: row.outcome,
      }
    )
  );
}

/** One page for the dashboard — only the rows being shown are checked on-chain. */
export async function listContracts(opts: {
  initiator?: string;
  status?: ContractStatus;
  page: number;
  pageSize: number;
}): Promise<ContractPage> {
  const { rows, total } = await getRowsPage(
    { initiator: opts.initiator, status: opts.status },
    { limit: opts.pageSize, offset: (opts.page - 1) * opts.pageSize }
  );
  return {
    items: await withChainState(rows),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

/** Every contract, unpaged — the admin console's oversight list. */
export async function listAllContracts(): Promise<Contract[]> {
  return withChainState(await getRows({}));
}
