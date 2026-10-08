/**
 * Register the platform's 4 tiebreakers: wallet + age identity, USDC account,
 * `register_moderator`, `set_tiebreaker`, reputation account. The admin pays for
 * all of it; the tiebreakers need their own SOL only to vote (see the end).
 *
 *   pnpm tiebreaker-register
 *
 * Safe to re-run: existing files in $MOD_DIR are reused and only the missing
 * steps run. Price is 0 — a tiebreaker inherits the fee of the seat it fills.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import anchorPkg, { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
const { BN } = anchorPkg;
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { generateModerationKeypair, recipientFromIdentity } from "@repo/shared";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import escrowIdl from "../src/solana/idl/desc_escrow.json";
import type { DescModeration } from "../src/solana/idl/desc_moderation";
import moderationIdl from "../src/solana/idl/desc_moderation.json";
import { rpcUrl, usdcMint } from "../src/config/cluster";
import { AUTHORITY_PATH, loadKeypair } from "./_keys";

const COUNT = 4;
const MOD_DIR = process.env.MOD_DIR ?? "./moderators";

async function provision(slug: string) {
  const walletPath = `${MOD_DIR}/${slug}-wallet.json`;
  const identityPath = `${MOD_DIR}/${slug}-identity.key`;
  if (existsSync(walletPath) && existsSync(identityPath)) {
    const identity = readFileSync(identityPath, "utf8").trim();
    return {
      wallet: Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")))),
      recipient: await recipientFromIdentity(identity),
      created: false,
    };
  }
  const wallet = Keypair.generate();
  const { identity, recipient } = await generateModerationKeypair();
  writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)));
  writeFileSync(identityPath, identity);
  return { wallet, recipient, created: true };
}

async function main() {
  const mint = new PublicKey(usdcMint());
  const connection = new Connection(rpcUrl, "confirmed");
  const admin = loadKeypair(AUTHORITY_PATH);
  const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" });
  const moderation = new Program<DescModeration>(moderationIdl as DescModeration, provider);
  const escrow = new Program<DescEscrow>(escrowIdl as DescEscrow, provider);

  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), admin.publicKey.toBuffer()],
    moderation.programId
  );
  mkdirSync(MOD_DIR, { recursive: true });

  for (let n = 1; n <= COUNT; n++) {
    const slug = `tiebreaker-${n}`;
    const { wallet, recipient, created } = await provision(slug);
    const me = wallet.publicKey;
    const [moderator] = PublicKey.findProgramAddressSync(
      [Buffer.from("moderator"), me.toBuffer()],
      moderation.programId
    );
    const [reputation] = PublicKey.findProgramAddressSync(
      [Buffer.from("mod_rep"), me.toBuffer()],
      escrow.programId
    );
    const done: string[] = [];

    await getOrCreateAssociatedTokenAccount(connection, admin, mint, me);

    const account = await moderation.account.moderator.fetchNullable(moderator);
    if (!account) {
      await moderation.methods
        .registerModerator(me, recipient, `Tiebreaker ${n}`, 0, new BN(0), 0)
        .accountsPartial({ admin: admin.publicKey, config, moderator, systemProgram: SystemProgram.programId })
        .rpc();
      done.push("registered");
    }
    if (!account?.isTiebreaker) {
      await moderation.methods
        .setTiebreaker(true)
        .accountsPartial({ admin: admin.publicKey, config, moderator })
        .rpc();
      done.push("flagged");
    }
    if (!(await escrow.account.moderatorReputation.fetchNullable(reputation))) {
      await escrow.methods
        .initModeratorReputation(me)
        .accountsPartial({ payer: admin.publicKey, reputation, systemProgram: SystemProgram.programId })
        .rpc();
      done.push("reputation");
    }

    console.log(
      `${slug}  ${me.toBase58()}  ${created ? "new files, " : ""}${done.length ? done.join(", ") : "already complete"}`
    );
  }

  console.log(`\nFiles: ${MOD_DIR}/tiebreaker-*-{wallet.json,identity.key} — never commit them.`);
  console.log("Give them SOL to vote: local `./fund-wallets.sh --tiebreakers`, devnet the faucet.");
  console.log("Then run: DESC_JUDGE=claude pnpm tiebreak-watch");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
