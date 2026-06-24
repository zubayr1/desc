/**
 * Dev bootstrap: prepares a local chain so the api has something to talk to.
 *   1. load the COLD authority (Anchor deployer) — signs initialize_config
 *   2. airdrop SOL to the authority (if low)
 *   3. create a dev USDC mint (6 decimals) + protocol treasury token account
 *   4. initialize_config(authority = cold, settlement_authority = the
 *      `desc_moderation` verdict-authority PDA)
 *
 * There is NO hot settlement keypair. The escrow's `settlement_authority` is set
 * directly to the moderation program's `[b"authority", config]` PDA — verdicts are
 * signed by the moderators via `desc_moderation`, never by the api. (The PDA can
 * sign once `pnpm moderation-init` has created the ModerationConfig; the address
 * itself is deterministic, so setting it here needs no deploy.)
 *
 * Prereq: a validator is running with the escrow program deployed (`anchor localnet`).
 * Run with: `pnpm bootstrap`.
 */
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import idl from "../src/solana/idl/desc_escrow.json";
import moderationIdl from "../src/solana/idl/desc_moderation.json";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const FEE_BPS = 200;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

/** The escrow's `settlement_authority` = the `desc_moderation` `[b"authority", config]`
 *  PDA, derived from the cold admin + the moderation program id. No keypair. */
function verdictAuthorityPda(admin: PublicKey): PublicKey {
  const modProgram = new PublicKey(moderationIdl.address);
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), admin.toBuffer()],
    modProgram
  );
  const [authority] = PublicKey.findProgramAddressSync(
    [Buffer.from("authority"), config.toBuffer()],
    modProgram
  );
  return authority;
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = loadKeypair(AUTHORITY_PATH); // cold deployer

  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: "confirmed",
  });
  const program = new Program<DescEscrow>(idl as DescEscrow, provider);

  await fundIfLow(connection, authority.publicKey);

  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), authority.publicKey.toBuffer()],
    program.programId
  );
  const settlementAuthority = verdictAuthorityPda(authority.publicKey);

  // Idempotent: initialize_config is one-shot — if the Config exists, just reprint.
  const existing = await program.account.config.fetchNullable(config);
  if (existing) {
    const treasuryAcc = await getAccount(connection, existing.treasury);
    console.log("Config already initialized — nothing else to do.");
    console.log("  authority (cold)    :", authority.publicKey.toBase58());
    console.log("  config              :", config.toBase58());
    console.log("  settlement authority:", existing.settlementAuthority.toBase58());
    console.log("  treasury            :", existing.treasury.toBase58());
    console.log("  USDC_MINT=" + treasuryAcc.mint.toBase58());
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
    .initializeConfig(settlementAuthority, treasury.address, FEE_BPS)
    .accountsPartial({
      authority: authority.publicKey,
      config,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Bootstrap complete:");
  console.log("  authority (cold)    :", authority.publicKey.toBase58());
  console.log("  config              :", config.toBase58());
  console.log(
    "  settlement authority:",
    settlementAuthority.toBase58(),
    "(desc_moderation PDA)"
  );
  console.log("  treasury            :", treasury.address.toBase58());
  console.log("\nSet these in apps/api/.env:");
  console.log("  CONFIG_AUTHORITY=" + authority.publicKey.toBase58());
  console.log("  USDC_MINT=" + mint.toBase58());
  console.log("\nNext: deploy desc_moderation + `pnpm moderation-init` (the PDA above");
  console.log("can sign verdicts once the ModerationConfig is initialized).");
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
