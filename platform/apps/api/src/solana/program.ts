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
  deadline: number;
}

/** Read an escrow account and map it into domain fields. */
export async function readEscrow(escrow: PublicKey): Promise<OnChainEscrow> {
  const acc = await program.account.escrow.fetch(escrow);
  return {
    status: mapStatus(acc.status as Record<string, unknown>),
    committer: acc.committer ? acc.committer.toBase58() : null,
    amount: acc.amount.toString(),
    protocolFee: acc.protocolFee.toString(),
    moderatorSurcharge: acc.moderatorSurcharge.toString(),
    outcome: mapOutcome(acc.outcome as Record<string, unknown> | null),
    deadline: acc.deadline.toNumber(),
  };
}
