/**
 * Run every e2e flow in sequence and print a pass/fail summary.
 *
 * Prereq: validator + program, `pnpm bootstrap` done, `pnpm db:push` done, and
 * the api running (`pnpm dev`). Then: `pnpm e2e:all`.
 *
 * Each flow is self-contained (fresh wallets + contract), so order doesn't
 * matter; it continues past failures so you see the full picture.
 */
import { spawnSync } from "node:child_process";

const FLOWS = [
  "e2e_create",
  "e2e_cancel",
  "e2e_accept",
  "e2e_submit",
  "e2e_verdict",
  "e2e_release",
  "e2e_refund",
  "e2e_mutual_cancel",
];

const results: { name: string; ok: boolean }[] = [];

for (const name of FLOWS) {
  console.log(`\n──────── ${name} ────────`);
  const res = spawnSync("npx", ["tsx", `scripts/e2e/${name}.ts`], {
    stdio: "inherit",
  });
  results.push({ name, ok: res.status === 0 });
}

console.log("\n════════ e2e summary ════════");
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"}  ${r.name}`);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
