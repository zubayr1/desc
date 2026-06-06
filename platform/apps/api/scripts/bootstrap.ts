/**
 * Dev bootstrap: prepares a local chain so the api has something to talk to.
 *   1. load the COLD authority (Anchor deployer) — signs initialize_config
 *   2. load-or-generate the HOT settlement keypair (saved to a file)
 *   3. airdrop SOL to the authority (if low)
 *   4. create a dev USDC mint (6 decimals) + protocol treasury token account
 *   5. initialize_config(authority = cold, settlement_authority = hot)
 *
 * Prereq: a validator is running with the program deployed (`anchor localnet`).
 * Run with: `pnpm bootstrap`.
 */
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import idl from "../src/solana/idl/desc_escrow.json";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const SETTLEMENT_PATH = expand(
  process.env.SETTLEMENT_KEYPAIR_PATH ?? "./settlement-keypair.json"
);
const FEE_BPS = 200;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

function loadOrCreateKeypair(path: string): { kp: Keypair; created: boolean } {
  if (existsSync(path)) return { kp: loadKeypair(path), created: false };
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  return { kp, created: true };
}

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Cold authority (signs init) + hot settlement key (set as settlement_authority).
  const authority = loadKeypair(AUTHORITY_PATH);
  const { kp: settlement, created } = loadOrCreateKeypair(SETTLEMENT_PATH);

  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: "confirmed",
  });
  const program = new Program<DescEscrow>(idl as DescEscrow, provider);

  // Fund BOTH keys: the authority pays for setup, and the hot settlement key
  // pays gas for every `record_verdict` tx — so it needs SOL too.
  await fundIfLow(connection, authority.publicKey);
  await fundIfLow(connection, settlement.publicKey);

  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), authority.publicKey.toBuffer()],
    program.programId
  );

  // Idempotent: if the Config already exists, just (re)fund the keys and stop —
  // initialize_config is one-shot, and re-running shouldn't mint a new USDC.
  const existing = await program.account.config.fetchNullable(config);
  if (existing) {
    console.log("Config already initialized — funded keys, nothing else to do.");
    console.log("  authority (cold) :", authority.publicKey.toBase58());
    console.log(
      "  settlement (hot) :",
      settlement.publicKey.toBase58(),
      created ? "(generated)" : "(existing)"
    );
    console.log("  config           :", config.toBase58());
    console.log("  treasury         :", existing.treasury.toBase58());
    return;
  }

  // First-time setup: dev USDC mint + treasury + initialize_config.
  const mint = await createMint(connection, authority, authority.publicKey, null, 6);
  const treasury = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey
  );
  await program.methods
    .initializeConfig(settlement.publicKey, treasury.address, FEE_BPS)
    .accountsPartial({
      authority: authority.publicKey,
      config,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Bootstrap complete:");
  console.log("  authority (cold) :", authority.publicKey.toBase58());
  console.log(
    "  settlement (hot) :",
    settlement.publicKey.toBase58(),
    created ? "(generated)" : "(existing)"
  );
  console.log("  config           :", config.toBase58());
  console.log("  treasury         :", treasury.address.toBase58());
  console.log("\nSet these in apps/api/.env:");
  console.log("  CONFIG_AUTHORITY=" + authority.publicKey.toBase58());
  console.log("  SETTLEMENT_KEYPAIR_PATH=" + SETTLEMENT_PATH);
  console.log("  USDC_MINT=" + mint.toBase58());
}

async function fundIfLow(connection: Connection, pubkey: PublicKey) {
  if ((await connection.getBalance(pubkey)) < LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
