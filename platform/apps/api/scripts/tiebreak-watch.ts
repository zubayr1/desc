/**
 * tiebreak-watch — one process for all platform tiebreakers.
 *
 * Each tick: find submitted contracts where voting closed with no majority,
 * hand each to the next tiebreaker in turn, judge, and `submit_tiebreak`. A
 * tiebreaker that fails is marked failed on that contract, so the next tick
 * hands it to the next one. Once no tiebreak can still decide, `finalize`.
 *
 *   DESC_JUDGE=claude pnpm tiebreak-watch [--once]
 *
 * Wallets: $MOD_DIR/tiebreaker-*-{wallet.json,identity.key}.
 * Model: DESC_TIEBREAK_MODEL (default claude-opus-5).
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { DescModeration } from "../src/solana/idl/desc_moderation";
import moderationIdl from "../src/solana/idl/desc_moderation.json";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import escrowIdl from "../src/solana/idl/desc_escrow.json";
import { rpcUrl } from "../src/config/cluster";
import * as storage from "../src/storage";
import { openAndVerify } from "../src/moderation/openVerify";
import { runCheck } from "../src/moderation/runCheck";
import { aiJudgeSelected } from "../src/moderation/judge";
import { VOTE_FAIL, VOTE_PASS, chainNow } from "../src/moderation/commit";
import { dbWorkSource } from "../src/moderation/watch/dbSource";
import { roundRobin } from "../src/moderation/tiebreak/roundRobin";
import { tiebreakPhase } from "../src/moderation/tiebreak/phase";
import { claimTiebreak, submittedWithPanel, triedBy, type Contested } from "../src/moderation/tiebreak/queue";
import { moderationConfigPda, moderatorPda, verdictAuthorityPda } from "../src/solana/moderation";
import { moderatorReputationPda } from "../src/solana/program";

const MOD_DIR = process.env.MOD_DIR ?? "./moderators";
const INTERVAL_MS = Number(process.env.TIEBREAK_WATCH_INTERVAL_MS ?? 15_000);
const once = process.argv.includes("--once");

interface Tiebreaker {
  slug: string;
  keypair: Keypair;
  identity: string;
  moderation: Program<DescModeration>;
}

const connection = new Connection(rpcUrl, "confirmed");
const provider = (kp: Keypair) => new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed" });

function loadTiebreakers(): Tiebreaker[] {
  return readdirSync(MOD_DIR)
    .map((f) => f.match(/^(tiebreaker-.+)-wallet\.json$/)?.[1])
    .filter((s): s is string => !!s)
    .sort()
    .map((slug) => {
      const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync(`${MOD_DIR}/${slug}-wallet.json`, "utf8")))
      );
      return {
        slug,
        keypair,
        identity: readFileSync(`${MOD_DIR}/${slug}-identity.key`, "utf8").trim(),
        moderation: new Program<DescModeration>(moderationIdl as DescModeration, provider(keypair)),
      };
    });
}

async function main() {
  if (!aiJudgeSelected()) throw new Error("tiebreakers must decide: set DESC_JUDGE=claude");
  process.env.DESC_JUDGE_ROLE = "tiebreak";
  process.env.DESC_JUDGE_MODEL = process.env.DESC_TIEBREAK_MODEL ?? "claude-opus-5";

  const all = loadTiebreakers();
  const tiebreakers: Tiebreaker[] = [];
  for (const t of all) {
    const m = await t.moderation.account.moderator.fetchNullable(moderatorPda(t.keypair.publicKey));
    if (m?.isTiebreaker && m.active) tiebreakers.push(t);
    else console.warn(`! ${t.slug} is not an active registered tiebreaker — skipped`);
  }
  if (!tiebreakers.length) throw new Error(`no tiebreakers in ${MOD_DIR} — run \`pnpm tiebreaker-register\``);

  const escrowProgram = new Program<DescEscrow>(escrowIdl as DescEscrow, provider(tiebreakers[0].keypair));
  const source = dbWorkSource();
  const rr = roundRobin(tiebreakers, (t) => t.keypair.publicKey.toBase58());

  console.log(`tiebreak-watch: ${tiebreakers.map((t) => t.slug).join(", ")}`);
  console.log(`  judge: ${process.env.DESC_JUDGE} (${process.env.DESC_JUDGE_MODEL})`);

  type Esc = Awaited<ReturnType<typeof escrowProgram.account.escrow.fetch>>;
  type Panel = Awaited<ReturnType<typeof escrowProgram.account.panel.fetch>>;

  async function decide(t: Tiebreaker, c: Contested, escrow: PublicKey, esc: Esc, panel: Panel) {
    const deliverableHash = Buffer.from(esc.deliverableHash).toString("hex");

    const ciphertext = await storage.get(c.storageKey);
    const opened = await openAndVerify({ ciphertext, identity: t.identity, expectedHash: deliverableHash });
    const result = await runCheck(c.criteria, opened.files, undefined, t.slug);
    for (const v of result.criteria) console.log(`  [${v.met ? "met" : "NOT met"}] ${v.description} — ${v.reason}`);

    const verdictHash = createHash("sha256")
      .update(JSON.stringify({ deliverableHash, outcome: result.outcome, reasoning: result.reasoning }))
      .digest();
    const silent = panel.entries.slice(0, panel.count).find((e) => e.vote !== VOTE_PASS && e.vote !== VOTE_FAIL);
    if (!silent) throw new Error("no silent seat left");

    const sig = await t.moderation.methods
      .submitTiebreak(result.outcome === "pass" ? { pass: {} } : { fail: {} }, Array.from(verdictHash))
      .accountsPartial({
        authority: t.keypair.publicKey,
        config: moderationConfigPda,
        verdictAuthority: verdictAuthorityPda,
        moderator: moderatorPda(t.keypair.publicKey),
        escrowConfig: esc.config,
        escrow,
        panel: esc.panel,
        replacedReputation: moderatorReputationPda(silent.moderator),
        descEscrowProgram: escrowProgram.programId,
      })
      .rpc();
    console.log(`  ${t.slug} → ${result.outcome.toUpperCase()} · tx ${sig}`);
  }

  /** Returns seconds until this contract's voting closes, if it hasn't yet. */
  async function handle(c: Contested): Promise<number | undefined> {
    const escrow = new PublicKey(c.escrowAddress);
    const esc = await escrowProgram.account.escrow.fetch(escrow);
    if (!("submitted" in esc.status)) return;
    const panel = await escrowProgram.account.panel.fetch(esc.panel);
    const now = await chainNow(connection);
    const phase = tiebreakPhase(esc, panel, now);
    if (!esc.outcome && now <= esc.revealDeadline.toNumber()) return esc.revealDeadline.toNumber() - now;

    if (phase === "finalize") {
      await escrowProgram.methods.finalize().accountsPartial({ escrow, panel: esc.panel }).rpc();
      console.log(`\n${c.title} · ${c.id} → INCONCLUSIVE (refund)`);
      return;
    }
    if (phase !== "tiebreak") return;

    const seated = panel.entries.slice(0, panel.count).map((e) => e.moderator.toBase58());
    const t = rr.pick(new Set([...seated, ...(await triedBy(c.id))]));
    if (!t || !(await claimTiebreak(c.id, t.keypair.publicKey))) return;

    console.log(`\n--- tiebreak: ${c.title} · ${c.id} → ${t.slug} ---`);
    try {
      await decide(t, c, escrow, esc, panel);
      await source.release(c.id, t.keypair.publicKey);
    } catch (err) {
      const msg = (err as Error).message;
      await source.fail(c.id, t.keypair.publicKey, msg);
      console.error(`  ! ${t.slug} failed: ${msg} — next tiebreaker takes it`);
    }
  }

  for (;;) {
    let wait = INTERVAL_MS;
    try {
      for (const c of await submittedWithPanel()) {
        try {
          const left = await handle(c);
          if (left !== undefined) wait = Math.min(wait, (left + 1) * 1000);
        } catch (err) {
          console.error(`  ! ${c.id}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.error(`  ! sweep failed: ${(err as Error).message}`);
    }
    if (once) return;
    // Wake right as the next contract's voting closes, so its tiebreak starts at once.
    await new Promise((r) => setTimeout(r, wait));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
