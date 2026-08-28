import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { CONTRACT_STATUSES, OUTCOMES, type ContractStatus, type Outcome } from "@repo/shared";
import type { DescEscrow } from "./idl/desc_escrow";
import idl from "./idl/desc_escrow.json";
import { env } from "../config/env";

export const connection = new Connection(env.RPC_URL, "confirmed");

/** Read-only provider. The api holds NO signing key — it only reads accounts and
 *  builds UNSIGNED user txns (the user's wallet signs; verdicts are signed by the
 *  moderators via `desc_moderation`). The throwaway wallet never signs. */
export const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), {
  commitment: "confirmed",
});
export const program = new Program<DescEscrow>(idl as DescEscrow, provider);
export const programId = program.programId;
export const usdcMint = new PublicKey(env.USDC_MINT);

/** Cold admin authority pubkey — seeds the Config PDA (no secret held by the api). */
export const configAuthority = new PublicKey(env.CONFIG_AUTHORITY);

// --- PDA derivations (mirror the program seeds) ---------------------------

export const configPda = (authority: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("config"), authority.toBuffer()],
    programId
  )[0];

export const escrowPda = (initiator: PublicKey, contractId: Buffer) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), initiator.toBuffer(), contractId],
    programId
  )[0];

export const vaultPda = (escrow: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrow.toBuffer()],
    programId
  )[0];

/** The platform's Config PDA (seeded by the cold authority pubkey). */
export const platformConfigPda = configPda(configAuthority);

// --- On-chain reads -------------------------------------------------------

const STATUS_SET = new Set<string>(CONTRACT_STATUSES);
const OUTCOME_SET = new Set<string>(OUTCOMES);

/** Unwrap an anchor enum (`{ funded: {} }` → `"funded"`) and validate it. */
const mapStatus = (s: Record<string, unknown>): ContractStatus => {
  const key = Object.keys(s)[0];
  if (!STATUS_SET.has(key)) throw new Error(`Unknown escrow status: ${key}`);
  return key as ContractStatus;
};

const mapOutcome = (o: Record<string, unknown> | null): Outcome | null => {
  if (!o) return null;
  const key = Object.keys(o)[0];
  if (!OUTCOME_SET.has(key)) throw new Error(`Unknown outcome: ${key}`);
  return key as Outcome;
};

export interface OnChainEscrow {
  status: ContractStatus;
  committer: string | null;
  amount: string;
  protocolFee: string;
  moderatorSurcharge: string;
  outcome: Outcome | null;
  /** The moderator that recorded the verdict (null until a verdict is recorded). */
  moderator: string | null;
  /** Initiator opted out of moderation — no moderator will ever be set. */
  noMod: boolean;
  deadline: number;
}

/** Map a decoded escrow account into domain fields. */
type EscrowAccount = Awaited<ReturnType<typeof program.account.escrow.fetch>>;
function mapEscrowAccount(acc: EscrowAccount): OnChainEscrow {
  return {
    status: mapStatus(acc.status as Record<string, unknown>),
    committer: acc.committer ? acc.committer.toBase58() : null,
    amount: acc.amount.toString(),
    protocolFee: acc.protocolFee.toString(),
    moderatorSurcharge: acc.moderatorSurcharge.toString(),
    outcome: mapOutcome(acc.outcome as Record<string, unknown> | null),
    moderator: acc.moderator.equals(PublicKey.default)
      ? null
      : acc.moderator.toBase58(),
    noMod: acc.noMod,
    deadline: acc.deadline.toNumber(),
  };
}

/** Read a single escrow account and map it into domain fields. */
export async function readEscrow(escrow: PublicKey): Promise<OnChainEscrow> {
  return mapEscrowAccount(await program.account.escrow.fetch(escrow));
}

/**
 * Batch-read many escrow accounts in one `getMultipleAccounts` round-trip
 * (chunked at 100). Missing accounts are omitted. Used by the read-model
 * reconciler so the list view reflects chain — including direct-to-chain txns
 * and `mod-run` verdicts that bypass the API's write-through cache.
 */
export async function readEscrows(
  addresses: PublicKey[]
): Promise<Map<string, OnChainEscrow>> {
  const out = new Map<string, OnChainEscrow>();
  const CHUNK = 100;
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const slice = addresses.slice(i, i + CHUNK);
    const accs = await program.account.escrow.fetchMultiple(slice);
    accs.forEach((acc, j) => {
      if (acc) out.set(slice[j].toBase58(), mapEscrowAccount(acc));
    });
  }
  return out;
}
