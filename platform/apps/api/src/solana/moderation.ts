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
