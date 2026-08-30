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

const _ = anchorPkg; // keep the CJS default import referenced under ESM

export const expand = (p: string) =>
  p.startsWith("~") ? p.replace(/^~/, homedir()) : p;
export const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
export const BASE = `http://localhost:${process.env.PORT ?? "3000"}`;
export const MOD_DIR = process.env.MOD_DIR ?? "./moderators";

export const loadKeypair = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function postJson(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
    const { recipients: mods } = await getJson<{ recipients: string[] }>(
      "/config/moderators"
    );
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

/** Resolve the single provisioned moderator, or fail with a useful message. */
function resolveModSlug(): string {
  const wallets = readdirSync(MOD_DIR).filter((f) => f.endsWith("-wallet.json"));
  if (wallets.length === 1) return wallets[0].replace(/-wallet\.json$/, "");
  throw new Error(
    wallets.length === 0
      ? `no mod wallets in ${MOD_DIR} — run \`pnpm moderator-register\` first`
      : `multiple mods in ${MOD_DIR}; e2e expects exactly one`
  );
}

/**
 * Record a verdict the way the product does: the moderator signs
 * `submit_verdict`, which CPIs into the escrow. No admin endpoint is involved.
 */
export async function recordVerdict(
  escrowAddress: string,
  outcome: "pass" | "fail"
): Promise<void> {
  const slug = resolveModSlug();
  const modKeypair = loadKeypair(`${MOD_DIR}/${slug}-wallet.json`);

  const connection = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(modKeypair), {
    commitment: "confirmed",
  });
  const moderation = new Program<DescModeration>(
    moderationIdl as DescModeration,
    provider
  );
  const escrowProgram = new Program<DescEscrow>(escrowIdl as DescEscrow, provider);

  const escrow = new PublicKey(escrowAddress);
  const acc = await escrowProgram.account.escrow.fetch(escrow);
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
      descEscrowProgram: escrowProgram.programId,
    })
    .rpc();
}
