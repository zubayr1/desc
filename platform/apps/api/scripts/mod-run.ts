/**
 * Step 7 — the mod runner. For one submitted contract, end to end:
 *   open+verify (5) → runCheck (6) → sign `submit_verdict` with the mod's wallet.
 *
 * The runner is the real automated path; only the verdict *brain* is a V1 stub —
 * so you pass the outcome (there's no AI yet) and `runCheck` packages it. The
 * CPI into `desc_escrow::record_verdict` is signed by the `[b"authority", config]`
 * PDA (no settlement keypair).
 *
 *   pnpm mod-run <contractId|linkToken> <pass|fail> [--mod <slug>] [--note "..."]
 *
 * Loads the mod's wallet (signs) + age identity (decrypts) from
 * ./moderators/<slug>-{wallet.json,identity.key}. If --mod is omitted and exactly
 * one mod is provisioned, it's auto-selected.
 *
 * Prereq: validator up, both programs deployed + `moderation-init` done, a mod
 *   registered, the escrow in `submitted`, AND the escrow's settlement_authority
 *   repointed to the verdict-authority PDA (`pnpm update-config --settlement <PDA>`).
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { Outcome } from "@repo/shared";
import type { DescModeration } from "../src/solana/idl/desc_moderation";
import moderationIdl from "../src/solana/idl/desc_moderation.json";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import escrowIdl from "../src/solana/idl/desc_escrow.json";
import { db } from "../src/db/client";
import { contracts } from "../src/db/schema";
import * as storage from "../src/storage";
import { openAndVerify } from "../src/moderation/openVerify";
import { runCheck, type AcceptanceCriterion } from "../src/moderation/runCheck";
import {
  moderationConfigPda,
  verdictAuthorityPda,
  moderatorPda,
} from "../src/solana/moderation";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const MOD_DIR = process.env.MOD_DIR ?? "./moderators";

// --- parse args (positional ref + outcome; --mod / --note flags) ---
const args = process.argv.slice(2);
let slug: string | undefined;
let note: string | undefined;
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--mod") slug = args[++i];
  else if (args[i] === "--note") note = args[++i];
  else positional.push(args[i]);
}
const ref = positional[0];
const outcome = positional[1] as Outcome | undefined;

if (!ref || (outcome !== "pass" && outcome !== "fail")) {
  console.error(
    'usage: mod-run <contractId|linkToken> <pass|fail> [--mod <slug>] [--note "..."]'
  );
  process.exit(1);
}
const verdictOutcome: Outcome = outcome; // narrowed by the guard above

function resolveSlug(): string {
  if (slug) return slug;
  const wallets = readdirSync(MOD_DIR).filter((f) => f.endsWith("-wallet.json"));
  if (wallets.length === 1) return wallets[0].replace(/-wallet\.json$/, "");
  throw new Error(
    wallets.length === 0
      ? `no mod wallets in ${MOD_DIR} — run \`pnpm moderator-register\` first`
      : `multiple mods in ${MOD_DIR}; pass --mod <slug>`
  );
}

async function main() {
  // 0. load the mod's wallet (signer) + age identity (decrypt key)
  const s = resolveSlug();
  const modKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${MOD_DIR}/${s}-wallet.json`, "utf8")))
  );
  const identity = readFileSync(`${MOD_DIR}/${s}-identity.key`, "utf8").trim();

  // resolve the contract (uuid or link token)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref!);
  const [row] = await db
    .select()
    .from(contracts)
    .where(isUuid ? eq(contracts.id, ref!) : eq(contracts.linkToken, ref!));
  if (!row) throw new Error(`contract not found for: ${ref}`);
  if (!row.deliverableStorageKey) throw new Error("no deliverable uploaded for this contract");

  const connection = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(modKeypair), {
    commitment: "confirmed",
  });
  const moderation = new Program<DescModeration>(moderationIdl as DescModeration, provider);
  const escrowProgram = new Program<DescEscrow>(escrowIdl as DescEscrow, provider);

  // read the escrow on-chain — must be `submitted`; take the committed hash + config
  const escrowAddr = new PublicKey(row.escrowAddress);
  const esc = await escrowProgram.account.escrow.fetch(escrowAddr);
  const status = Object.keys(esc.status as Record<string, unknown>)[0];
  if (status !== "submitted") {
    throw new Error(`escrow is ${status}, not submitted — nothing to judge`);
  }
  const deliverableHash = Buffer.from(esc.deliverableHash as number[]).toString("hex");

  // 5. open + verify the sealed bundle against the on-chain commitment
  const ciphertext = await storage.get(row.deliverableStorageKey);
  const opened = await openAndVerify({ ciphertext, identity, expectedHash: deliverableHash });
  console.log(`open+verify: ${opened.files.length} files, hash ✓ matches chain`);

  // 6. runCheck (V1 stub: the operator's manual outcome)
  const criteria = (row.acceptanceCriteria as AcceptanceCriterion[] | null) ?? [];
  const result = await runCheck(criteria, opened.files, { outcome: verdictOutcome, note });

  // verdict_hash embeds the deliverable hash → (exact artifact, verdict on it)
  const verdictHash = createHash("sha256")
    .update(
      JSON.stringify({ deliverableHash, outcome: result.outcome, reasoning: result.reasoning })
    )
    .digest();

  // 7. submit_verdict — signed by the mod's wallet, CPI into the escrow
  const outcomeArg = result.outcome === "pass" ? { pass: {} } : { fail: {} };
  const sig = await moderation.methods
    .submitVerdict(outcomeArg, Array.from(verdictHash))
    .accountsPartial({
      authority: modKeypair.publicKey,
      config: moderationConfigPda,
      verdictAuthority: verdictAuthorityPda,
      moderator: moderatorPda(modKeypair.publicKey),
      escrowConfig: esc.config as PublicKey,
      escrow: escrowAddr,
      descEscrowProgram: escrowProgram.programId,
    })
    .rpc();

  console.log(`\nverdict recorded: ${result.outcome.toUpperCase()}`);
  console.log("  mod        :", s, `(${modKeypair.publicKey.toBase58()})`);
  console.log("  contract   :", row.id);
  console.log("  reasoning  :", result.reasoning);
  console.log("  tx         :", sig);
  console.log(
    `\nThe verdict is on-chain. The ${result.outcome === "pass" ? "committer can Release" : "initiator can Reclaim"} now.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
