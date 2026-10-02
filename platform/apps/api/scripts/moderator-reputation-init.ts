/**
 * Create the on-chain reputation account for every registered moderator that
 * lacks one.
 *
 * `release` and `refund` take one `ModeratorReputation` PDA per panel SEAT, so a
 * moderator seated without one makes its escrow **unsettleable** — the money
 * sits in the vault until somebody creates the account. This script is both the
 * backfill for moderators registered before reputation shipped, and the repair
 * tool for that situation.
 *
 * Safe to run any number of times: it creates only what is missing and reports
 * what it skipped. It never touches an account that already exists, because
 * re-initialising one would zero a moderator's entire history.
 *
 * Needs no special key. `init_moderator_reputation` is permissionless by design
 * — the caller only pays rent (~0.0015 SOL each) and gains no authority over
 * what it created — so ANY funded keypair can run this. The keypair pays; it is
 * `CONFIG_AUTHORITY` (a pubkey, not a secret) that says whose moderators to look
 * at, exactly as the api resolves them.
 *
 * Run with: `pnpm moderator-reputation-init`  (add `--dry-run` to only report)
 *
 * Prereq: both programs deployed at the version that has `init_moderator_reputation`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import escrowIdl from "../src/solana/idl/desc_escrow.json";
import type { DescModeration } from "../src/solana/idl/desc_moderation";
import moderationIdl from "../src/solana/idl/desc_moderation.json";
import { rpcUrl } from "../src/config/cluster";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const DRY_RUN = process.argv.includes("--dry-run");

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main() {
  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(AUTHORITY_PATH);
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
  });

  const escrow = new Program<DescEscrow>(escrowIdl as DescEscrow, provider);
  const moderation = new Program<DescModeration>(
    moderationIdl as DescModeration,
    provider
  );

  // Scoped to THIS platform's config, the same filter the api uses — otherwise
  // a moderator registered under somebody else's config would be funded here.
  //
  // Seeded by CONFIG_AUTHORITY and NOT by the payer: the two are the same person
  // when the admin runs this, but the whole point of a permissionless repair is
  // that somebody else can run it, and deriving the config from whoever happens
  // to be paying would silently find zero moderators for them.
  const authority = process.env.CONFIG_AUTHORITY;
  if (!authority) {
    throw new Error(
      "CONFIG_AUTHORITY is not set — it seeds the moderation config, so without it " +
        "there is no way to know whose moderators to back-fill."
    );
  }
  const [moderationConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), new PublicKey(authority).toBuffer()],
    moderation.programId
  );

  // Inactive moderators are included on purpose: one can be reactivated, and a
  // moderator still seated on a live escrow must be settleable whatever its
  // current flag says.
  const moderators = (await moderation.account.moderator.all()).filter((m) =>
    m.account.config.equals(moderationConfig)
  );

  if (moderators.length === 0) {
    console.log("No moderator is registered under this config — nothing to do.");
    return;
  }

  const repPda = (wallet: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("mod_rep"), wallet.toBuffer()],
      escrow.programId
    )[0];

  // One round-trip for the whole set rather than a read per moderator.
  const existing = await escrow.account.moderatorReputation.fetchMultiple(
    moderators.map((m) => repPda(m.account.authority))
  );

  let created = 0;
  for (const [i, m] of moderators.entries()) {
    const wallet = m.account.authority;
    const pda = repPda(wallet);
    const label = `${m.account.label} (${wallet.toBase58()})`;

    if (existing[i]) {
      const r = existing[i];
      console.log(
        `  skip    ${label}\n` +
          `          has a record already — ${r.verdictsCast} verdicts, ` +
          `${r.majorityAgreements}/${r.panelVerdicts} with the majority`
      );
      continue;
    }

    if (DRY_RUN) {
      console.log(`  WOULD CREATE  ${label}\n          → ${pda.toBase58()}`);
      created++;
      continue;
    }

    await escrow.methods
      .initModeratorReputation(wallet)
      .accountsPartial({
        payer: payer.publicKey,
        reputation: pda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`  created ${label}\n          → ${pda.toBase58()}`);
    created++;
  }

  console.log(
    `\n${DRY_RUN ? "Would create" : "Created"} ${created} of ${moderators.length} ` +
      `reputation account${moderators.length === 1 ? "" : "s"}.`
  );
  if (!DRY_RUN && created > 0) {
    console.log(
      "Every registered moderator can now be seated on a panel and settled."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
