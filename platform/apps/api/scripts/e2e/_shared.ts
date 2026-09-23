/**
 * Shared steps for the e2e scripts.
 *
 * These two flows changed shape after the scripts were written and are the
 * reason the suite went stale:
 *
 *   - A deliverable is no longer a URL string. The committer packs a folder,
 *     the browser seals it to every active moderator (and the initiator), and
 *     only the ciphertext is uploaded. The chain stores sha256(manifest).
 *   - A verdict is no longer an admin endpoint. A registered moderator signs
 *     `submit_verdict` with its own wallet, which CPIs into the escrow — the
 *     api holds no key that can do it.
 *
 * Prereq for `recordVerdict`: `pnpm moderation-init` and `pnpm moderator-register`
 * have been run, so a mod wallet exists under ./moderators.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import anchorPkg, { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { buildBundle, encryptToRecipients, type Contract } from "@repo/shared";
import type { DescModeration } from "../../src/solana/idl/desc_moderation";
import moderationIdl from "../../src/solana/idl/desc_moderation.json";
import type { DescEscrow } from "../../src/solana/idl/desc_escrow";
import escrowIdl from "../../src/solana/idl/desc_escrow.json";
import {
  moderationConfigPda,
  verdictAuthorityPda,
  moderatorPda,
} from "../../src/solana/moderation";

import { rpcUrl } from "../../src/config/cluster";
const _ = anchorPkg; // keep the CJS default import referenced under ESM

export const expand = (p: string) =>
  p.startsWith("~") ? p.replace(/^~/, homedir()) : p;
export const RPC = rpcUrl;
export const BASE = `http://localhost:${process.env.PORT ?? "3000"}`;
export const MOD_DIR = process.env.MOD_DIR ?? "./moderators";

/** The cold authority keypair — also the dev USDC mint authority. */
export const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);

export const loadKeypair = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

/**
 * Wait out a rate limit rather than failing on it.
 *
 * `POST /contracts` allows 10 a minute — it writes an unfunded draft row before
 * any wallet signature, so it is the spam vector. That limit is correct, and the
 * suite now runs more than ten scripts, so a full `e2e:all` trips it and fails
 * scripts that have nothing wrong with them (a different set each run, since it
 * depends on timing). The harness respects the limit instead of the product
 * being loosened for tests.
 *
 * The api tells us how long to wait, so this sleeps exactly that long.
 */
async function withRateLimit(send: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await send();
    if (res.status !== 429 || attempt >= 3) return res;
    const body = await res.clone().text();
    const seconds = Number(body.match(/retry in (\d+)/)?.[1] ?? 5);
    console.log(`  … rate limited, waiting ${seconds}s`);
    await new Promise((r) => setTimeout(r, (seconds + 1) * 1000));
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await withRateLimit(() => fetch(`${BASE}${path}`));
  if (!res.ok) throw new Error(`GET ${path} failed: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function postJson(path: string, body: unknown) {
  const res = await withRateLimit(() =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res.json();
}

export async function signAndSubmit(
  unsignedTx: string,
  signer: Keypair,
  path: string
) {
  const tx = Transaction.from(Buffer.from(unsignedTx, "base64"));
  tx.partialSign(signer);
  return postJson(path, { signedTx: tx.serialize().toString("base64") });
}

const toB64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

/**
 * Pack a small synthetic project, seal it to the contract's recipients, upload
 * the ciphertext, then sign and submit the on-chain `submit`.
 *
 * Mirrors what the browser does, so the hash the chain ends up anchoring is
 * produced the same way the real client produces it.
 */
export async function deliverBundle(
  token: string,
  committer: Keypair
): Promise<{ status: string; deliverableHash: string }> {
  const contract = await getJson<Contract>(`/links/${token}`);

  const enc = new TextEncoder();
  const built = buildBundle(
    [
      { path: "src/index.ts", content: enc.encode("export const ok = true;\n") },
      { path: "README.md", content: enc.encode("# delivered by the e2e suite\n") },
    ],
    { withBlob: true }
  );
  if (!built.ok || !built.blob || !built.deliverableHash || !built.root) {
    throw new Error("bundle failed to build");
  }
  const deliverableHash = built.deliverableHash;

  // A no-mod contract is sealed to the initiator alone — no moderator will ever
  // open it, so none receives a copy.
  let recipients: string[];
  if (contract.noMod) {
    if (!contract.initiatorRecipient) {
      throw new Error("no-mod contract has no initiator key to seal to");
    }
    recipients = [contract.initiatorRecipient];
  } else {
    // Every moderator on this contract's panel — the same rule the browser
    // follows, with the same fallbacks for contracts created before it existed.
    const mods = contract.panel?.length
      ? contract.panel.map((m) => m.recipient)
      : contract.moderatorRecipient
        ? [contract.moderatorRecipient]
        : (await getJson<{ recipients: string[] }>("/config/moderators")).recipients;
    const initiatorKey = contract.initiatorRecipient;
    recipients = initiatorKey ? [...mods, initiatorKey] : mods;
    if (!recipients.length) {
      throw new Error("no moderators registered — run `pnpm moderator-register`");
    }
  }

  const ciphertext = await encryptToRecipients(built.blob, recipients);
  await postJson(`/links/${token}/deliverable/upload`, {
    deliverableHash,
    root: built.root,
    ciphertext: toB64(ciphertext),
  });

  const prep = (await postJson(`/links/${token}/deliverable/prepare`, {})) as {
    unsignedTx: string;
  };
  const out = (await signAndSubmit(
    prep.unsignedTx,
    committer,
    `/links/${token}/deliverable/submit`
  )) as { status: string };

  return { status: out.status, deliverableHash };
}

export interface ModOffer {
  wallet: string;
  label: string;
  baseBps: number;
  /** Judges for real, then submits the OPPOSITE verdict. Localnet/devnet only. */
  test?: boolean;
}

/** Active moderators and their own on-chain prices, cheapest first. */
export async function listModerators(): Promise<ModOffer[]> {
  const { moderators } = await getJson<{ moderators: ModOffer[] }>("/config/fees");
  if (!moderators.length) {
    throw new Error("no active moderator — run `pnpm moderator-register` first");
  }
  return [...moderators].sort((a, b) => a.baseBps - b.baseBps);
}

/**
 * The moderator a new e2e contract is created with: the cheapest active one,
 * exactly as the app would list it. The api refuses to guess when several are
 * active, so the scripts choose explicitly.
 *
 * Never a test moderator — it would fail work that should pass, and every other
 * script asserts the honest outcome.
 */
export async function pickModerator(): Promise<string> {
  const honest = (await listModerators()).filter((m) => !m.test);
  if (!honest.length) {
    throw new Error("only test moderators are registered — register a real one");
  }
  return honest[0].wallet;
}

/**
 * A panel of `size` moderators, cheapest first, **including a test moderator**
 * when one is registered and the panel has room for it.
 *
 * Putting the bad panellist in on purpose is the point of the multi-moderator
 * run: a panel that only ever agrees proves nothing about the majority rule.
 */
export async function pickPanel(size: number): Promise<ModOffer[]> {
  const all = await listModerators();
  if (all.length < size) {
    throw new Error(
      `need ${size} active moderators for a panel of ${size}, found ${all.length} — see platform/README.md`
    );
  }
  if (size === 1) return [all.find((m) => !m.test) ?? all[0]];

  const test = all.find((m) => m.test);
  const honest = all.filter((m) => m !== test);
  // Majority honest, one test moderator — with 3 seats that is 2 against 1.
  return test ? [...honest.slice(0, size - 1), test] : all.slice(0, size);
}

/**
 * The local keypair of a moderator, matched against the wallets on disk.
 */
export function modKeypairFor(assigned: PublicKey): Keypair {
  const wallets = readdirSync(MOD_DIR).filter((f) => f.endsWith("-wallet.json"));
  for (const f of wallets) {
    const kp = loadKeypair(`${MOD_DIR}/${f}`);
    if (kp.publicKey.equals(assigned)) return kp;
  }
  throw new Error(
    wallets.length === 0
      ? `no mod wallets in ${MOD_DIR} — run \`pnpm moderator-register\` first`
      : `the assigned moderator ${assigned.toBase58()} has no wallet in ${MOD_DIR}`
  );
}

/** The escrow's `Panel` PDA — closed on settle, so its absence is the proof. */
export function panelAddress(escrow: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("panel"), escrow.toBuffer()],
    new PublicKey(escrowIdl.address)
  )[0];
}

/** Does this account still exist on chain? */
export async function accountExists(pubkey: PublicKey): Promise<boolean> {
  const connection = new Connection(RPC, "confirmed");
  return (await connection.getAccountInfo(pubkey)) !== null;
}

/** One seat on an escrow's panel, as the chain has it. */
export interface Seat {
  wallet: PublicKey;
  /** Its own fee on this contract, base units. */
  fee: bigint;
  /** null until it votes. */
  vote: "pass" | "fail" | null;
}

/**
 * The escrow's panel, in on-chain order.
 *
 * The PANEL is who may vote — not the escrow's `moderator` field, which is only
 * set on a single-moderator contract and is the default pubkey on a panel of
 * three.
 */
export async function panelSeats(escrowAddress: string): Promise<Seat[]> {
  const connection = new Connection(RPC, "confirmed");
  const reader = new Program<DescEscrow>(
    escrowIdl as DescEscrow,
    new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" })
  );
  const acc = await reader.account.escrow.fetch(new PublicKey(escrowAddress));
  const panel = await reader.account.panel.fetch(acc.panel as PublicKey);
  const VOTES = [null, "pass", "fail"] as const;
  return panel.entries.slice(0, panel.count).map((e) => ({
    wallet: e.moderator as PublicKey,
    fee: BigInt(e.fee.toString()),
    vote: VOTES[e.vote] ?? null,
  }));
}

/**
 * Record a verdict the way the product does: the moderator signs
 * `submit_verdict`, which CPIs into the escrow. No admin endpoint is involved.
 *
 * `moderator` names which seat votes; omitted, it is the first seat that has
 * not voted yet, which keeps every single-moderator script working unchanged.
 */
export async function recordVerdict(
  escrowAddress: string,
  outcome: "pass" | "fail",
  moderator?: PublicKey
): Promise<void> {
  const connection = new Connection(RPC, "confirmed");
  const reader = new Program<DescEscrow>(
    escrowIdl as DescEscrow,
    new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" })
  );
  const escrow = new PublicKey(escrowAddress);
  const acc = await reader.account.escrow.fetch(escrow);

  const seat =
    moderator ?? (await panelSeats(escrowAddress)).find((s) => s.vote === null)?.wallet;
  if (!seat) throw new Error("every seat on this panel has already voted");
  const modKeypair = modKeypairFor(seat);

  const provider = new AnchorProvider(connection, new Wallet(modKeypair), {
    commitment: "confirmed",
  });
  const moderation = new Program<DescModeration>(
    moderationIdl as DescModeration,
    provider
  );
  const escrowProgram = new Program<DescEscrow>(escrowIdl as DescEscrow, provider);
  const deliverableHash = Buffer.from(acc.deliverableHash as number[]).toString("hex");

  const verdictHash = createHash("sha256")
    .update(JSON.stringify({ deliverableHash, outcome, reasoning: "e2e" }))
    .digest();

  await moderation.methods
    .submitVerdict(outcome === "pass" ? { pass: {} } : ({ fail: {} } as never), Array.from(verdictHash))
    .accountsPartial({
      authority: modKeypair.publicKey,
      config: moderationConfigPda,
      verdictAuthority: verdictAuthorityPda,
      moderator: moderatorPda(modKeypair.publicKey),
      escrowConfig: acc.config as PublicKey,
      escrow,
      panel: acc.panel as PublicKey,
      descEscrowProgram: escrowProgram.programId,
    })
    .rpc();
}
