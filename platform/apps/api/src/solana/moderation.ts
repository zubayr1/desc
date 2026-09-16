import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { DescModeration } from "./idl/desc_moderation";
import idl from "./idl/desc_moderation.json";
import { env } from "../config/env";

/**
 * Read-only view of the `desc_moderation` program. The chain is the source of
 * truth for the moderator set (recipients live in the `Moderator` accounts), so
 * this replaces the old Postgres registry for committer-facing reads.
 *
 * Deliberately decoupled from `program.ts` / the settlement key — it builds its
 * own connection + a throwaway wallet that never signs (we only fetch accounts).
 */
const connection = new Connection(env.RPC_URL, "confirmed");
const readProvider = new AnchorProvider(connection, new Wallet(Keypair.generate()), {
  commitment: "confirmed",
});

export const moderationProgram = new Program<DescModeration>(
  idl as DescModeration,
  readProvider
);
export const moderationProgramId = moderationProgram.programId;

/** The platform's ModerationConfig PDA (seeded by the cold admin pubkey). */
export const moderationConfigPda = PublicKey.findProgramAddressSync(
  [Buffer.from("config"), new PublicKey(env.CONFIG_AUTHORITY).toBuffer()],
  moderationProgramId
)[0];

/** The verdict-authority signer PDA = the escrow's `settlement_authority`. */
export const verdictAuthorityPda = PublicKey.findProgramAddressSync(
  [Buffer.from("authority"), moderationConfigPda.toBuffer()],
  moderationProgramId
)[0];

export const moderatorPda = (authority: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("moderator"), authority.toBuffer()],
    moderationProgramId
  )[0];

/**
 * Public age recipients of all active moderators (on-chain) — what a committer's
 * browser encrypts the deliverable to. Filtered to this platform's config.
 */
export async function listActiveRecipients(): Promise<string[]> {
  const mods = await moderationProgram.account.moderator.all();
  return mods
    .filter(
      (m) => m.account.active && m.account.config.equals(moderationConfigPda)
    )
    .map((m) => m.account.recipient);
}

/** A moderator chosen for a contract, with the price escrow will snapshot. */
export interface ModeratorQuote {
  /** The moderator's wallet — what the escrow binds as `moderator`. */
  authority: PublicKey;
  /** The Moderator PDA, passed to `create_escrow`. */
  pda: PublicKey;
  baseBps: number;
  feePerKb: bigint;
  maxBundleKb: number;
}

/**
 * Pick the moderator for a new contract and read its on-chain price.
 *
 * `requested` is the moderator's wallet when the initiator chose one. Without
 * it, V1 falls back to the only active moderator — and refuses to guess when
 * there are several, since the choice decides who judges and what it costs.
 */
export async function resolveModerator(requested?: PublicKey): Promise<ModeratorQuote> {
  const active = (await moderationProgram.account.moderator.all()).filter(
    (m) => m.account.active && m.account.config.equals(moderationConfigPda)
  );

  const pick = requested
    ? active.find((m) => m.account.authority.equals(requested))
    : active.length === 1
      ? active[0]
      : undefined;

  if (!pick) {
    const why = requested
      ? "that moderator is not registered or not active"
      : active.length === 0
        ? "no active moderator is registered"
        : `${active.length} moderators are active — choose one`;
    throw Object.assign(new Error(why), { statusCode: 400 });
  }

  return {
    authority: pick.account.authority,
    pda: pick.publicKey,
    baseBps: pick.account.baseBps,
    feePerKb: BigInt(pick.account.feePerKb.toString()),
    maxBundleKb: pick.account.maxBundleKb,
  };
}

/** Same math as `Escrow::moderation_ceiling` on-chain — what the initiator locks up. */
export function moderationCeiling(amount: bigint, q: ModeratorQuote): bigint {
  return (amount * BigInt(q.baseBps)) / 10_000n + q.feePerKb * BigInt(q.maxBundleKb);
}
