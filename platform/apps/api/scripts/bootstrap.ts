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
import anchorPkg, { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
// `BN` isn't a statically-detectable named export under ESM — pull it off default.
const { BN } = anchorPkg;
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

import { cluster, descEnv, rpcUrl } from "../src/config/cluster";
const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);

const RPC = rpcUrl;
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const FEE_BPS = 200;
const FEE_MIN = 1_000_000; // $1 floor (base units) — configurable via update-config
// Smallest contract the protocol accepts. At 200 bps + a $1 floor the two meet
// at $50; below that the floor would be a punitive share of the contract.
const MIN_AMOUNT = 50_000_000; // $50

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

  // Idempotent: initialize_config is one-shot — if the Config exists, check it
  // still points at a treasury for the right mint, and reprint.
  const existing = await program.account.config.fetchNullable(config);
  if (existing) {
    const treasuryAcc = await getAccount(connection, existing.treasury);
    const want = cluster.usdcMint;

    // The treasury is a token account, so it holds exactly ONE mint. If the
    // cluster's settlement mint has changed under it — moving devnet from a
    // stand-in to Circle's real USDC, say — every `release` would fail on
    // `treasury.mint == escrow.mint` with the money already in the vault. Fix
    // it here rather than leaving a trap for the first settlement.
    if (want && treasuryAcc.mint.toBase58() !== want) {
      console.log(
        `Treasury holds ${treasuryAcc.mint.toBase58()} but ${descEnv} settles in ${want}.`
      );
      const fixed = await getOrCreateAssociatedTokenAccount(
        connection,
        authority,
        new PublicKey(want),
        authority.publicKey
      );
      await program.methods
        .updateConfig(null, fixed.address, null, null, null, null)
        .accountsPartial({ authority: authority.publicKey, config })
        .rpc();
      console.log("  repointed treasury  :", fixed.address.toBase58());
    }

    const finalCfg = await program.account.config.fetch(config);
    const finalTreasury = await getAccount(connection, finalCfg.treasury);
    console.log("Config already initialized — nothing else to do.");
    console.log("  authority (cold)    :", authority.publicKey.toBase58());
    console.log("  config              :", config.toBase58());
    console.log("  settlement authority:", finalCfg.settlementAuthority.toBase58());
    console.log("  treasury            :", finalCfg.treasury.toBase58());
    console.log("  min amount          :", finalCfg.minAmount.toString());
    console.log("  fee floor           :", finalCfg.protocolFeeMin.toString());
    console.log(
      cluster.usdcMint
        ? `  mint                : ${cluster.usdcMint} (fixed for ${descEnv} — do NOT set USDC_MINT)`
        : "  USDC_MINT=" + finalTreasury.mint.toBase58()
    );
    return;
  }

  // First-time setup. On a cluster with a real settlement currency we use it;
  // only localnet gets a stand-in, because there is nothing else there.
  const mint = cluster.usdcMint
    ? new PublicKey(cluster.usdcMint)
    : await createMint(connection, authority, authority.publicKey, null, 6);
  if (cluster.usdcMint) {
    console.log(`Settling in ${descEnv}'s own USDC: ${cluster.usdcMint}`);
  }
  const treasury = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey
  );
  await program.methods
    .initializeConfig(
      settlementAuthority,
      treasury.address,
      FEE_BPS,
      new BN(FEE_MIN),
      new BN(MIN_AMOUNT)
    )
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
  if (cluster.usdcMint) {
    console.log(
      `  (no USDC_MINT — ${descEnv} settles in ${cluster.usdcMint}, pinned in clusters.ts)`
    );
  }
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
