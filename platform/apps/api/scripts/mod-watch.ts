/**
 * mod-watch — the moderator's discovery loop.
 *
 * `mod-run` judges ONE contract you name. This polls for work, runs `mod-run`
 * on whatever it finds, and reveals this moderator's committed votes once
 * reveals open.
 *
 *   pnpm mod-watch                          # manual verdicts, prompts per contract
 *   DESC_JUDGE=claude pnpm mod-watch        # the AI judges, unattended
 *   DESC_JUDGE=claude pnpm mod-watch --once # single sweep, then exit
 *
 * Scope, deliberately: one of OUR moderators, reading our own database. It sees
 * only the contracts whose panel it sits on and has not yet voted, so three
 * watchers can run side by side on one panel without colliding. Serving
 * outside moderators over HTTP lives behind `WorkSource`, so V2 swaps the
 * source and leaves this loop alone.
 *
 * Judging is delegated to `mod-run` as a child process rather than imported.
 * Discovery and judging stay separate concerns, a crash in one contract cannot
 * take down the loop, and `mod-run` keeps working exactly as it does today.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import escrowIdl from "../src/solana/idl/desc_escrow.json";
import { rpcUrl } from "../src/config/cluster";
import { revealCommitted } from "../src/moderation/commit";
import { dbWorkSource } from "../src/moderation/watch/dbSource";
import { moderatorModel } from "../src/moderation/moderatorModel";
import { isMischief } from "../src/moderation/judge/mischief";
import type { WorkItem } from "../src/moderation/watch/source";

const MOD_DIR = process.env.MOD_DIR ?? "./moderators";
const INTERVAL_MS = Number(process.env.MOD_WATCH_INTERVAL_MS ?? 15_000);

const args = process.argv.slice(2);
const once = args.includes("--once");
const slugArg = args.includes("--mod") ? args[args.indexOf("--mod") + 1] : undefined;

function resolveSlug(): string {
  if (slugArg) return slugArg;
  const wallets = readdirSync(MOD_DIR).filter((f) => f.endsWith("-wallet.json"));
  if (wallets.length === 1) return wallets[0].replace(/-wallet\.json$/, "");
  throw new Error(
    wallets.length === 0
      ? `no mod wallets in ${MOD_DIR} — run \`pnpm moderator-register\` first`
      : `multiple mods in ${MOD_DIR}; pass --mod <slug>`
  );
}

/** `mod-run`'s exit code for a hidden vote awaiting its reveal. */
const EXIT_COMMITTED = 3;

/** Run `mod-run` for one contract. Resolves to its exit code. */
function judge(item: WorkItem, slug: string): Promise<number> {
  return new Promise((resolve) => {
    // The local tsx binary directly, not `npx` — npx shells out to npm, which
    // prints its own config warnings over every contract we judge.
    const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
    const child = spawn(
      tsx,
      ["scripts/mod-run.ts", item.contractId, "--mod", slug],
      { stdio: "inherit", env: process.env }
    );
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  const slug = resolveSlug();
  const modKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${MOD_DIR}/${slug}-wallet.json`, "utf8")))
  );
  const moderator = modKeypair.publicKey;
  const escrowProgram = new Program<DescEscrow>(
    escrowIdl as DescEscrow,
    new AnchorProvider(new Connection(rpcUrl, "confirmed"), new Wallet(modKeypair), {
      commitment: "confirmed",
    })
  );

  const source = dbWorkSource();
  const isAi = process.env.DESC_JUDGE === "claude" || process.env.DESC_JUDGE === "claude-api";
  // Fail at startup, not on the first contract: a moderator with no model set
  // must not start judging at all.
  const model = isAi ? moderatorModel(slug) : "";
  const judgeName =
    process.env.DESC_JUDGE === "claude"
      ? `claude (${model}) — Claude subscription`
      : process.env.DESC_JUDGE === "claude-api"
        ? `claude-api (${model}) — billed as API usage`
        : "manual";

  console.log(`mod-watch: ${slug} (${moderator.toBase58()})`);
  console.log(`  source: ${source.name}`);
  console.log(`  judge:  ${judgeName}`);
  console.log(once ? "  mode:   single sweep" : `  mode:   polling every ${INTERVAL_MS}ms`);
  if (isMischief(slug)) {
    // Loud on purpose: a watcher that inverts verdicts must never be mistaken
    // for a real one in a terminal someone is half-watching.
    console.log(
      `\n!! ${slug} is a TEST moderator (DESC_MISCHIEF_MODS) — it judges for real\n` +
        "   and then submits the OPPOSITE verdict. Local and devnet only.\n"
    );
  }
  if (judgeName === "manual") {
    console.log("\n! DESC_JUDGE is not `claude` — mod-run will ask for a verdict it was not given\n" +
                "  and exit. Set DESC_JUDGE=claude to run unattended.");
  }

  // Progress lives in the DATABASE, not in this process. A restart used to lose
  // the in-memory record of what had been tried, so every fresh watcher paid to
  // re-judge everything it had already judged.
  for (;;) {
    let work: WorkItem[] = [];
    try {
      work = await source.claim(moderator);
    } catch (err) {
      console.error(`  ! could not claim work: ${(err as Error).message}`);
    }

    for (const item of work) {
      const nth = item.attempts > 1 ? ` (attempt ${item.attempts})` : "";
      console.log(`\n--- ${item.title ?? "(untitled)"} · ${item.contractId}${nth} ---`);
      const code = await judge(item, slug);
      if (code === 0) {
        await source.release(item.contractId, moderator);
      } else if (code === EXIT_COMMITTED) {
        // Claim stays `committed`; the reveal sweep below finishes it.
      } else {
        // Marked failed rather than left claimed: these are near-always
        // permanent for that contract (no criteria, bundle too large, a
        // deliverable this mod cannot decrypt). Retrying every tick would
        // spend real money on the same doomed check forever. The reason is
        // stored, so it can be shown or cleared by hand.
        await source.fail(
          item.contractId,
          moderator,
          "mod-run exited without submitting a verdict"
        );
        console.error("  ! no verdict submitted — marked failed, not retrying");
      }
    }

    try {
      await revealCommitted(source, modKeypair, escrowProgram);
    } catch (err) {
      console.error(`  ! reveal sweep failed: ${(err as Error).message}`);
    }

    if (once) {
      console.log(work.length ? "\nsweep complete" : "nothing waiting");
      return;
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
