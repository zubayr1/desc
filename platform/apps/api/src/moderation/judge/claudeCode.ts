/**
 * The AI moderator on the Claude SUBSCRIPTION (`DESC_JUDGE=claude`, the default).
 *
 * Runs the verdict through Claude Code in headless mode (`claude -p`), which
 * authenticates with the Claude Code login — the subscription — rather than
 * with API credits. Same prompt, same injection defences and same fail-closed
 * verdict mapping as the API variant in `claude.ts`.
 *
 * Claude Code is an agent with tools, and the deliverable is hostile input, so
 * it is locked down before it ever sees the files:
 *   - `--tools ""`             no built-in tools: nothing to read, write or run
 *   - `--strict-mcp-config`    no MCP servers
 *   - `--setting-sources ""`   no user/project settings, so no hooks
 *   - `--disable-slash-commands`, fixed `--system-prompt`
 *   - an empty temp working dir, so no CLAUDE.md or project files in reach
 * An instruction smuggled into a delivered file has nothing to act with.
 *
 * Never `--bare`: that mode ignores the subscription login and bills an API key.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { z } from "zod/v4";
import type { InputFile } from "@repo/shared";
import type { AcceptanceCriterion, Judge, JudgeResult } from "./types";
import { JudgeError } from "./types";
import { SYSTEM, VerdictSchema, buildPrompt, judgeModel, toResult } from "./claude";

const TIMEOUT_MS = Number(process.env.DESC_JUDGE_TIMEOUT_MS ?? 5 * 60_000);

/** The verdict schema for `--json-schema`. zod stamps a draft-2020-12 `$schema`
 *  that Claude Code's validator rejects, so it is dropped — the shape is unchanged. */
const VERDICT_JSON_SCHEMA = (() => {
  const { $schema: _drop, ...schema } = z.toJSONSchema(VerdictSchema) as Record<string, unknown>;
  void _drop;
  return JSON.stringify(schema);
})();

/**
 * Find the Claude Code binary: `CLAUDE_BIN`, then `claude` on PATH, then the
 * copy bundled with the VS Code extension (newest first).
 */
function claudeBinary(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const p = join(dir, "claude");
    if (dir && existsSync(p)) return p;
  }
  for (const root of [".vscode-server/extensions", ".vscode/extensions"]) {
    const base = join(homedir(), root);
    if (!existsSync(base)) continue;
    const found = readdirSync(base)
      .filter((d) => d.startsWith("anthropic.claude-code-"))
      .map((d) => join(base, d, "resources", "native-binary", "claude"))
      .filter((p) => existsSync(p))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (found[0]) return found[0];
  }
  throw new JudgeError("Claude Code not found — install it, or set CLAUDE_BIN to its path");
}

/** Claude Code's `--output-format json` result — only the fields we use. */
interface HeadlessResult {
  is_error?: boolean;
  result?: string;
  api_error_status?: string | null;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function runHeadless(bin: string, args: string[], stdin: string): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), "desc-judge-"));
  // No API credential and no `ant` profile in reach: Claude Code can only use
  // its own login, so a stray ANTHROPIC_API_KEY can never quietly bill the API.
  const env: NodeJS.ProcessEnv = { ...process.env, ANTHROPIC_CONFIG_DIR: cwd };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_PROFILE;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new JudgeError(`Claude Code did not answer within ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new JudgeError(`could not start Claude Code: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      rmSync(cwd, { recursive: true, force: true });
      if (code === 0 || out.trim().startsWith("{")) resolve(out);
      else reject(new JudgeError(`Claude Code exited ${code}: ${(err || out).trim().slice(0, 300)}`));
    });
    child.stdin.end(stdin);
  });
}

export function claudeCodeJudge(): Judge {
  const MODEL = judgeModel();
  return {
    name: `claude-code:${MODEL}`,

    async judge(criteria: AcceptanceCriterion[], files: InputFile[]): Promise<JudgeResult> {
      const prompt = buildPrompt(criteria, files);
      const args = [
        "-p",
        "--output-format", "json",
        "--model", MODEL,
        "--system-prompt", SYSTEM,
        "--json-schema", VERDICT_JSON_SCHEMA,
        "--tools", "",
        "--strict-mcp-config",
        "--setting-sources", "",
        "--disable-slash-commands",
        "--no-session-persistence",
      ];

      const raw = await runHeadless(claudeBinary(), args, prompt);
      let res: HeadlessResult;
      try {
        res = JSON.parse(raw) as HeadlessResult;
      } catch {
        throw new JudgeError("Claude Code returned output that is not JSON");
      }
      if (res.is_error) {
        throw new JudgeError(
          `Claude Code reported an error${res.api_error_status ? ` (${res.api_error_status})` : ""}: ${String(res.result ?? "").slice(0, 300)}`
        );
      }
      const parsed = VerdictSchema.safeParse(res.structured_output);
      if (!parsed.success) {
        throw new JudgeError("model returned no parseable verdict");
      }

      const u = res.usage ?? {};
      return toResult(criteria, parsed.data, {
        inputTokens:
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
        // Claude Code's API-equivalent estimate. The subscription pays, not API
        // credits — kept because moderation fees will be priced from real cost.
        costUsd: res.total_cost_usd ?? 0,
      });
    },
  };
}
