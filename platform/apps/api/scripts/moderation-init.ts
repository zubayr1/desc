/**
 * Step 3a — initialize the `desc_moderation` program on a local chain.
 *
 *   1. load the COLD authority (Anchor deployer) — becomes the moderation `admin`
 *   2. derive ModerationConfig PDA [b"config", admin] + the verdict-authority PDA
 *      [b"authority", config]
 *   3. initialize(escrow_program = desc_escrow, min_verdicts = 1) — creates the
 *      config and stores the authority bump
 *   4. print the verdict-authority PDA: the value the escrow's `settlement_authority`
 *      is repointed to LATER (only once a mod can actually `submit_verdict`)
 *
 * This does NOT repoint the escrow — that's the last sub-step of step 3, after a
 * registered mod can settle. Idempotent: re-running on an existing config reprints.
 *
 * Prereq: a validator running with BOTH programs deployed
 *   (`anchor localnet` for desc_escrow, then `anchor deploy` desc_moderation).
 * Run with: `pnpm moderation-init`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import type { DescModeration } from "../src/solana/idl/desc_moderation";
import idl from "../src/solana/idl/desc_moderation.json";
import escrowIdl from "../src/solana/idl/desc_escrow.json";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const MIN_VERDICTS = 1;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function fundIfLow(connection: Connection, pubkey: PublicKey) {
  if ((await connection.getBalance(pubkey)) < LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = loadKeypair(AUTHORITY_PATH); // cold deployer = moderation admin

  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: "confirmed",
  });
  const program = new Program<DescModeration>(idl as DescModeration, provider);
  const escrowProgram = new PublicKey(escrowIdl.address);

  await fundIfLow(connection, authority.publicKey);

  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), authority.publicKey.toBuffer()],
    program.programId
  );
  const [verdictAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("authority"), config.toBuffer()],
    program.programId
  );

  // Idempotent: initialize is one-shot.
  const existing = await program.account.moderationConfig.fetchNullable(config);
  if (existing) {
    console.log("ModerationConfig already initialized — nothing to do.");
  } else {
    await program.methods
      .initialize(escrowProgram, MIN_VERDICTS)
      .accountsPartial({
        admin: authority.publicKey,
        config,
        authority: verdictAuthority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("desc_moderation initialized.");
  }

  console.log("  admin (cold)      :", authority.publicKey.toBase58());
  console.log("  moderationConfig  :", config.toBase58());
  console.log(
    "  verdict authority :",
    verdictAuthority.toBase58(),
    "(escrow settlement_authority — already set by bootstrap)"
  );
  console.log("  escrow_program    :", escrowProgram.toBase58());
  console.log("  min_verdicts      :", MIN_VERDICTS);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
