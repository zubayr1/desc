/**
 * Step 4 — onboard a moderator (on-chain).
 *
 *   1. provision the mod's WALLET keypair + age identity (saved to files)
 *   2. fund the wallet: SOL (gas) + a USDC token account (to receive its fee)
 *   3. register_moderator(wallet, recipient, label, price) — admin-signed; writes
 *      the `Moderator` account on-chain (recipient and price now live on-chain)
 *
 * Hand the two files to that mod's runner: `wallet.json` is its signer (signs
 * `submit_verdict`), `identity.key` is its decrypt key. Both are gitignored.
 *
 * Prereq: validator up, both programs deployed, `pnpm moderation-init` done, and
 *   `USDC_MINT` set in the env (run `pnpm bootstrap`). Admin-gated in V1 — the
 *   cold authority signs; permissionless stake-gated self-registration is V2.
 *
 * Run with: `pnpm moderator-register "Olympus (Mod-Claude-Opus)" --base-bps 100`.
 *
 * Price flags (the moderator's own quote; escrow snapshots it at creation):
 *   --base-bps <n>        REQUIRED. Share of the contract amount (100 = 1%, max 500).
 *                         No default on purpose — a moderator's price is a decision,
 *                         not something to inherit silently.
 *   --fee-per-kb <n>      Per-KB of deliverable text, base units. Default 0.
 *   --max-bundle-kb <n>   Largest deliverable accepted, KB. Default 0 (no limit).
 *   The model it judges with is NOT set here: add MODEL_<SLUG>=<model id> to .env
 *   (the script prints the exact line).
 *   Size pricing (the last two) is V2: escrow refuses a non-zero value today.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import anchorPkg, { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
// `BN` isn't a statically-detectable named export under ESM — pull it off default.
const { BN } = anchorPkg;
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { generateModerationKeypair } from "@repo/shared";
import { modelEnvName } from "../src/moderation/moderatorModel";
import type { DescModeration } from "../src/solana/idl/desc_moderation";
import idl from "../src/solana/idl/desc_moderation.json";

import { rpcUrl, usdcMint } from "../src/config/cluster";
const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const RPC = rpcUrl;
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const MOD_DIR = process.env.MOD_DIR ?? "./moderators";
const GAS_SOL = 0.05; // a tiny buffer — thousands of verdict txns

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
/** A non-negative integer flag, or `fallback` when the flag is absent. */
const intFlag = (name: string, fallback?: number): number => {
  const raw = flag(name);
  if (raw === undefined) {
    if (fallback === undefined) throw new Error(`${name} is required`);
    return fallback;
  }
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return Number(raw);
};

// The label is the first argument that is neither a flag nor a flag's value.
const label =
  argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--"))) ??
  "Moderator";
const slug =
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "moderator";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main() {
  const baseBps = intFlag("--base-bps");
  const feePerKb = intFlag("--fee-per-kb", 0);
  const maxBundleKb = intFlag("--max-bundle-kb", 0);

  // Fixed on mainnet, from `bootstrap` elsewhere — and it throws with a usable
  // message rather than a null pubkey if the mint does not exist yet.
  const mint = new PublicKey(usdcMint());

  const connection = new Connection(RPC, "confirmed");
  const admin = loadKeypair(AUTHORITY_PATH); // cold authority = moderation admin
  const provider = new AnchorProvider(connection, new Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new Program<DescModeration>(idl as DescModeration, provider);

  // 1. provision the mod's wallet + age identity, persist both
  const wallet = Keypair.generate();
  const { identity, recipient } = await generateModerationKeypair();

  mkdirSync(MOD_DIR, { recursive: true });
  const walletPath = `${MOD_DIR}/${slug}-wallet.json`;
  const identityPath = `${MOD_DIR}/${slug}-identity.key`;
  writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)));
  writeFileSync(identityPath, identity);

  // 2. fund the wallet: SOL for gas + a USDC token account for rewards
  const airdrop = await connection.requestAirdrop(
    wallet.publicKey,
    GAS_SOL * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdrop, "confirmed");
  const usdcAta = await getOrCreateAssociatedTokenAccount(
    connection,
    admin, // payer for the ATA rent
    mint,
    wallet.publicKey
  );

  // 3. register on-chain (admin-signed)
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), admin.publicKey.toBuffer()],
    program.programId
  );
  const [moderator] = PublicKey.findProgramAddressSync(
    [Buffer.from("moderator"), wallet.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .registerModerator(
      wallet.publicKey,
      recipient,
      label,
      baseBps,
      new BN(feePerKb),
      maxBundleKb
    )
    .accountsPartial({
      admin: admin.publicKey,
      config,
      moderator,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`\nRegistered moderator "${label}" on-chain — now active.`);
  console.log("  moderator PDA   :", moderator.toBase58());
  console.log("  wallet (signer) :", wallet.publicKey.toBase58(), `→ ${walletPath}`);
  console.log("  USDC account    :", usdcAta.address.toBase58());
  console.log("  recipient (age) :", recipient);
  console.log(
    "  price           :",
    `${(baseBps / 100).toFixed(2)}% of amount` +
      (feePerKb ? ` + ${feePerKb}/KB (max ${maxBundleKb} KB)` : "")
  );
  console.log("  identity (key)  :", `${identityPath}  (give to the mod's runner; never commit)`);
  console.log(
    "\nThe runner uses BOTH files: wallet.json signs submit_verdict, identity.key decrypts."
  );
  console.log(`\nSet its model in .env:  ${modelEnvName(slug)}=claude-opus-5   (or claude-haiku-4-5, …)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
