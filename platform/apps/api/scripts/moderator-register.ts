/**
 * Step 4 — onboard a moderator (on-chain).
 *
 *   1. provision the mod's WALLET keypair + age identity (saved to files)
 *   2. fund the wallet: SOL (gas) + a USDC token account (to receive the 1% reward)
 *   3. register_moderator(wallet, recipient, label) — admin-signed; writes the
 *      `Moderator` account on-chain (the recipient now lives on-chain)
 *
 * Hand the two files to that mod's runner: `wallet.json` is its signer (signs
 * `submit_verdict`), `identity.key` is its decrypt key. Both are gitignored.
 *
 * Prereq: validator up, both programs deployed, `pnpm moderation-init` done, and
 *   `USDC_MINT` set in the env (run `pnpm bootstrap`). Admin-gated in V1 — the
 *   cold authority signs; permissionless stake-gated self-registration is V2.
 *
 * Run with: `pnpm moderator-register "Mod A"`.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { generateModerationKeypair } from "@repo/shared";
import type { DescModeration } from "../src/solana/idl/desc_moderation";
import idl from "../src/solana/idl/desc_moderation.json";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const MOD_DIR = process.env.MOD_DIR ?? "./moderators";
const GAS_SOL = 0.05; // a tiny buffer — thousands of verdict txns

const label = process.argv[2] ?? "Moderator";
const slug =
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "moderator";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main() {
  const usdcMintStr = process.env.USDC_MINT;
  if (!usdcMintStr) throw new Error("USDC_MINT not set — run `pnpm bootstrap` first.");
  const usdcMint = new PublicKey(usdcMintStr);

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
    usdcMint,
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
    .registerModerator(wallet.publicKey, recipient, label)
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
  console.log("  identity (key)  :", `${identityPath}  (give to the mod's runner; never commit)`);
  console.log(
    "\nThe runner uses BOTH files: wallet.json signs submit_verdict, identity.key decrypts."
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
