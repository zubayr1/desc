/**
 * Does the AI judge actually have credentials here?
 *
 * The one check worth running on a new machine — a container, a fresh host —
 * before wiring up a moderator that will sit in a polling loop. It makes one
 * tiny real call and reports how it authenticated, so a misconfigured box fails
 * in ten seconds rather than on the first contract someone submits.
 *
 * On the Claude subscription (`DESC_JUDGE=claude`) Claude Code authenticates
 * from `~/.claude/.credentials.json` or a `CLAUDE_CODE_OAUTH_TOKEN` — the
 * headless/CI path, generated with `claude setup-token`. Nothing interactive
 * happens at runtime.
 *
 *   pnpm judge-auth                 # uses DESC_JUDGE from .env
 *   DESC_JUDGE=claude pnpm judge-auth
 */
import "dotenv/config";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { aiJudge, aiJudgeSelected, JudgeError } from "../src/moderation/judge";
import type { InputFile } from "@repo/shared";

const enc = new TextEncoder();

async function main() {
  console.log("DESC_JUDGE            :", process.env.DESC_JUDGE ?? "(unset → manual)");
  console.log("CLAUDE_BIN            :", process.env.CLAUDE_BIN ?? "(unset → PATH)");
  console.log(
    "CLAUDE_CODE_OAUTH_TOKEN:",
    process.env.CLAUDE_CODE_OAUTH_TOKEN ? "set" : "(unset)"
  );
  console.log(
    "~/.claude/.credentials :",
    existsSync(join(homedir(), ".claude", ".credentials.json")) ? "present" : "absent"
  );
  console.log(
    "ANTHROPIC_API_KEY      :",
    process.env.ANTHROPIC_API_KEY ? "set (only used by DESC_JUDGE=claude-api)" : "(unset)"
  );
  console.log();

  if (!aiJudgeSelected()) {
    throw new Error(
      "DESC_JUDGE is not `claude` or `claude-api` — there is no AI judge to authenticate."
    );
  }

  const judge = aiJudge();
  console.log(`judge: ${judge.name}\nasking it one trivial question…\n`);

  const files: InputFile[] = [
    { path: "answer.txt", content: enc.encode("The answer is 4.\n") },
  ];
  const result = await judge.judge(
    [{ description: "The file states that the answer is 4." }],
    files
  );

  console.log("verdict :", result.outcome.toUpperCase());
  console.log("reason  :", result.reasoning);
  // Claude Code reports a cost for subscription runs too — it is what the same
  // call WOULD have cost on the API, not a charge. What actually decides who
  // pays is which judge ran, so say that instead of reading it off the number.
  const billed = process.env.DESC_JUDGE === "claude-api";
  console.log(
    "usage   :",
    `${result.usage.inputTokens} in / ${result.usage.outputTokens} out · ` +
      `$${result.usage.costUsd.toFixed(4)}${billed ? " (billed)" : " (API-equivalent — paid by the subscription)"}`
  );
  console.log(
    "\n✅ the judge is authenticated and working on this machine." +
      (billed
        ? "\n   ! DESC_JUDGE=claude-api — this is billed as Anthropic API usage."
        : "\n   Running on the Claude subscription via Claude Code. No API credits used.")
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(
      `\n❌ ${e instanceof JudgeError ? "judge failed" : "check failed"}: ${e.message}`
    );
    console.error(
      "\nOn a server, the subscription needs BOTH:\n" +
        "  1. Claude Code installed (npm i -g @anthropic-ai/claude-code, or set CLAUDE_BIN)\n" +
        "  2. CLAUDE_CODE_OAUTH_TOKEN — generate it on a machine you can log in on:\n" +
        "       claude setup-token"
    );
    process.exit(1);
  });
