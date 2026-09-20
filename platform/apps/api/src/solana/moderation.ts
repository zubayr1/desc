import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { ModeratorOffer } from "@repo/shared";
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
  return (await activeModerators()).map((m) => m.account.recipient);
}

/**
 * Every active moderator registered under THIS platform's config. The single
 * definition of "a moderator you can use" — the fee quote and the create path
 * both go through it, so what the form quotes is what gets charged.
 */
async function activeModerators() {
  return (await moderationProgram.account.moderator.all()).filter(
    (m) => m.account.active && m.account.config.equals(moderationConfigPda)
  );
}

/** Active moderators as public offers, for the fee quote and the picker. */
export async function listModeratorOffers(): Promise<ModeratorOffer[]> {
  return (await activeModerators()).map((m) => ({
    wallet: m.account.authority.toBase58(),
    label: m.account.label,
    baseBps: m.account.baseBps,
    feePerKb: m.account.feePerKb.toString(),
    maxBundleKb: m.account.maxBundleKb,
  }));
}

/** A moderator chosen for a contract, with the price escrow will snapshot. */
export interface ModeratorQuote {
  /** The moderator's wallet — its seat on the escrow's panel. */
  authority: PublicKey;
  label: string;
  /** The Moderator PDA, passed to `create_escrow`. */
  pda: PublicKey;
  baseBps: number;
  feePerKb: bigint;
  maxBundleKb: number;
  /** Its public age recipient — what the committer seals this contract's delivery to. */
  recipient: string;
}

/**
 * Pick the moderator for a new contract and read its on-chain price.
 *
 * `requested` is the moderator's wallet when the initiator chose one. Without
 * it, V1 falls back to the only active moderator — and refuses to guess when
 * there are several, since the choice decides who judges and what it costs.
 */
export async function resolveModerator(requested?: PublicKey): Promise<ModeratorQuote> {
  const active = await activeModerators();

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
    label: pick.account.label,
    pda: pick.publicKey,
    baseBps: pick.account.baseBps,
    feePerKb: BigInt(pick.account.feePerKb.toString()),
    maxBundleKb: pick.account.maxBundleKb,
    recipient: pick.account.recipient,
  };
}

/** Legal panel sizes. Even panels are rejected on-chain: a tie has no majority
 *  and the escrow would sit unsettleable. */
const PANEL_SIZES = [1, 3];

/**
 * Resolve a contract's whole panel and read each moderator's on-chain price.
 *
 * `requested` are the chosen moderators' wallets. Without them, V1 falls back to
 * the single active moderator — and refuses to guess when there are several,
 * since the choice decides who judges and what it costs.
 *
 * Every seat is validated the way `create_escrow` will: a legal panel size, no
 * moderator listed twice, and each one registered and active under this
 * platform's config. Failing here gives the initiator a readable 400 instead of
 * a program error after they have signed.
 */
export async function resolvePanel(
  requested?: PublicKey[]
): Promise<ModeratorQuote[]> {
  if (!requested || requested.length === 0) return [await resolveModerator()];

  if (!PANEL_SIZES.includes(requested.length)) {
    throw Object.assign(
      new Error(
        `a panel must have ${PANEL_SIZES.join(" or ")} moderators — an even panel cannot reach a majority`
      ),
      { statusCode: 400 }
    );
  }
  const seen = new Set(requested.map((w) => w.toBase58()));
  if (seen.size !== requested.length) {
    throw Object.assign(
      new Error("the same moderator was chosen twice — a panel needs distinct judges"),
      { statusCode: 400 }
    );
  }

  // Sequential on purpose: `resolveModerator` reports WHICH wallet is bad, and
  // the panels are at most three.
  const quotes: ModeratorQuote[] = [];
  for (const wallet of requested) quotes.push(await resolveModerator(wallet));
  return quotes;
}

/** Same math as `Escrow::moderation_ceiling` on-chain — what the initiator locks up. */
export function moderationCeiling(amount: bigint, q: ModeratorQuote): bigint {
  return (amount * BigInt(q.baseBps)) / 10_000n + q.feePerKb * BigInt(q.maxBundleKb);
}

/** What the whole panel costs: each moderator's own ceiling, summed. Never one
 *  fee divided up — every seat runs the entire check. */
export function panelCeiling(amount: bigint, quotes: ModeratorQuote[]): bigint {
  return quotes.reduce((sum, q) => sum + moderationCeiling(amount, q), 0n);
}
