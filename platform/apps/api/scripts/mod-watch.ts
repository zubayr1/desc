/**
 * mod-watch — the moderator's discovery loop.
 *
 * `mod-run` judges ONE contract you name. Nothing tells it a contract is
 * waiting, so end-to-end testing means copy-pasting link tokens. This polls for
 * work and runs `mod-run` on whatever it finds.
 *
 *   pnpm mod-watch                          # manual verdicts, prompts per contract
 *   DESC_JUDGE=claude pnpm mod-watch        # the AI judges, unattended
 *   DESC_JUDGE=claude pnpm mod-watch --once # single sweep, then exit
 *
 * Scope, deliberately: ONE moderator (ours), reading our own database. The two
 * things that make it a real worker — serving any moderator, and only the
 * contracts that moderator was assigned — live behind `WorkSource`, so V2 swaps
 * the source and leaves this loop alone.
 *
 * Judging is delegated to `mod-run` as a child process rather than imported.
 * Discovery and judging stay separate concerns, a crash in one contract cannot
 * take down the loop, and `mod-run` keeps working exactly as it does today.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import { dbWorkSource } from "../src/moderation/watch/dbSource";
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

/** Run `mod-run` for one contract. Resolves to the exit code and captured tail. */
function judge(item: WorkItem, slug: string): Promise<boolean> {
  return new Promise((resolve) => {
    // The local tsx binary directly, not `npx` — npx shells out to npm, which
    // prints its own config warnings over every contract we judge.
    const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
    const child = spawn(
      tsx,
      ["scripts/mod-run.ts", item.contractId, "--mod", slug],
      { stdio: "inherit", env: process.env }
    );
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function main() {
  const slug = resolveSlug();
  const moderator = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${MOD_DIR}/${slug}-wallet.json`, "utf8")))
  ).publicKey;

  const source = dbWorkSource();
  const judgeName = process.env.DESC_JUDGE === "claude" ? "claude" : "manual";

  console.log(`mod-watch: ${slug} (${moderator.toBase58()})`);
  console.log(`  source: ${source.name}`);
  console.log(`  judge:  ${judgeName}`);
  console.log(once ? "  mode:   single sweep" : `  mode:   polling every ${INTERVAL_MS}ms`);
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
      const ok = await judge(item, slug);
      if (ok) {
        await source.release(item.contractId);
      } else {
        // Marked failed rather than left claimed: these are near-always
        // permanent for that contract (no criteria, bundle too large, a
        // deliverable this mod cannot decrypt). Retrying every tick would
        // spend real money on the same doomed check forever. The reason is
        // stored, so it can be shown or cleared by hand.
        await source.fail(item.contractId, "mod-run exited without submitting a verdict");
        console.error("  ! no verdict submitted — marked failed, not retrying");
      }
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
