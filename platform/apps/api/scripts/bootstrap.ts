/**
 * Dev bootstrap: prepares a local chain so the api has something to talk to.
 *   1. airdrop SOL to the platform key (if low)
 *   2. create a dev USDC mint (6 decimals)
 *   3. create the protocol treasury token account
 *   4. initialize_config (authority + settlement_authority = platform key)
 *
 * Prereq: a validator is running with the program deployed (`anchor localnet`
 * or `anchor deploy`). Run with: `pnpm bootstrap`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
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

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const KP_PATH = (process.env.PLATFORM_KEYPAIR_PATH ?? "~/.config/solana/id.json").replace(
  /^~/,
  homedir()
);
const FEE_BPS = 200;

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const platform = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(KP_PATH, "utf8")))
  );
  const provider = new AnchorProvider(connection, new Wallet(platform), {
    commitment: "confirmed",
  });
  const program = new Program<DescEscrow>(idl as DescEscrow, provider);

  // 1. airdrop if low
  if ((await connection.getBalance(platform.publicKey)) < LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(platform.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // 2. dev USDC mint
  const mint = await createMint(connection, platform, platform.publicKey, null, 6);

  // 3. treasury token account (owned by the platform key)
  const treasury = await getOrCreateAssociatedTokenAccount(
    connection,
    platform,
    mint,
    platform.publicKey
  );

  // 4. initialize_config
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), platform.publicKey.toBuffer()],
    program.programId
  );
  await program.methods
    .initializeConfig(platform.publicKey, treasury.address, FEE_BPS)
    .accountsPartial({
      authority: platform.publicKey,
      config,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Bootstrap complete:");
  console.log("  platform :", platform.publicKey.toBase58());
  console.log("  config   :", config.toBase58());
  console.log("  treasury :", treasury.address.toBase58());
  console.log("  feeBps   :", FEE_BPS);
  console.log("\nAdd this to apps/api/.env:");
  console.log("  USDC_MINT=" + mint.toBase58());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
