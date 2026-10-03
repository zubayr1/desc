/**
 * Helper AI — turns a brief into acceptance criteria a moderator can check.
 *
 * Not a moderator: no wallet, no on-chain account, paid nothing, votes on
 * nothing, and runs BEFORE a contract exists. Everything it returns is a
 * suggestion the initiator edits or discards.
 *
 * It exists because a moderator judges the delivered files against the criteria
 * AS WRITTEN, so "the code should be clean" forces it to invent a standard and
 * the verdict really is arbitrary. Runs on whatever `DESC_JUDGE` selects, so it
 * never silently bills API credits.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { DELIVERABLE_TYPE_HINTS, type DeliverableType } from "@repo/shared";
import { JudgeError } from "../moderation/judge/types";
import {
  claudeBinary,
  runHeadless,
  type HeadlessResult,
} from "../moderation/judge/claudeCode";

/** Under three is rarely a spec; over six and nobody reads them. */
const MIN = 3;
const MAX = 6;

/** Sonnet, not the moderators' Opus: a drafting task nobody pays for. */
const helperModel = () => process.env.DESC_HELPER_MODEL ?? "claude-sonnet-5";

export interface CriteriaRequest {
  title: string;
  brief: string;
  deliverableType: DeliverableType;
  /** Anything the initiator already typed. Refined rather than discarded. */
  existing?: string[];
}

const CriteriaSchema = z.object({
  criteria: z
    .array(
      z.object({
        description: z
          .string()
          .describe("One acceptance criterion, checkable from the submitted files alone."),
      })
    )
    .min(MIN)
    .max(MAX),
});

const SYSTEM = `You write acceptance criteria for an escrow contract.

An initiator describes work they want. A committer will later deliver a FOLDER OF FILES, and an AI moderator will decide — from those files and nothing else — whether each criterion is met. Money is released or refunded on that decision.

So every criterion you write MUST be decidable by reading the delivered files.

Write criteria that can be checked:
  - "All tests under /tests pass when run against the submitted files"
  - "A README explains how to run the project without a build step"
  - "An invalid address produces a visible error message instead of failing silently"

NEVER write criteria that depend on the outside world, because the moderator cannot see it:
  - anything about a pull request being merged, reviewed or approved
  - anything deployed, hosted, live, or running on a server
  - anything about the client being happy, or the work being "professional",
    "clean", "production-ready", "well-structured" or "high quality"
  - anything measured after delivery, like uptime or user numbers

Each criterion is one specific, testable claim about the delivered files. Prefer concrete nouns from the brief (file names, commands, behaviours) over adjectives. If the brief is too vague to pin down, choose the most reasonable concrete reading and write that — a specific criterion the initiator can correct beats a vague one nobody can check.

Where the initiator's draft contains something uncheckable, replace it with the closest checkable thing and say nothing about the original. Never write a criterion ABOUT the criteria, and never mention what you excluded or why — every line you return has to be something a moderator can mark met or not met.

Return ${MIN}-${MAX} criteria. No numbering, no preamble, no commentary.`;

function buildPrompt(req: CriteriaRequest): string {
  const existing = (req.existing ?? []).map((s) => s.trim()).filter(Boolean);
  return [
    "<deliverable_type>",
    `${req.deliverableType} — ${DELIVERABLE_TYPE_HINTS[req.deliverableType]}`,
    "</deliverable_type>",
    "",
    "<title>",
    req.title.trim(),
    "</title>",
    "",
    "<brief>",
    req.brief.trim(),
    "</brief>",
    ...(existing.length
      ? [
          "",
          "<initiator_draft>",
          "The initiator already wrote these. Keep what is checkable, rewrite what is not,",
          "and fill the rest.",
          ...existing.map((c) => `- ${c}`),
          "</initiator_draft>",
        ]
      : []),
    "",
    "Write the acceptance criteria.",
  ].join("\n");
}

/** Is a judge configured that the helper can borrow? */
export const helperAvailable = () =>
  process.env.DESC_JUDGE === "claude" || process.env.DESC_JUDGE === "claude-api";

const JSON_SCHEMA = (() => {
  const { $schema: _drop, ...schema } = z.toJSONSchema(CriteriaSchema) as Record<string, unknown>;
  void _drop;
  return JSON.stringify(schema);
})();

async function viaClaudeCode(prompt: string): Promise<string[]> {
  const raw = await runHeadless(
    claudeBinary(),
    [
      "-p",
      "--output-format", "json",
      "--model", helperModel(),
      "--system-prompt", SYSTEM,
      "--json-schema", JSON_SCHEMA,
      // Same lockdown as the moderator — the brief is untrusted input.
      "--tools", "",
      "--strict-mcp-config",
      "--setting-sources", "",
      "--disable-slash-commands",
      "--no-session-persistence",
    ],
    prompt
  );

  let res: HeadlessResult;
  try {
    res = JSON.parse(raw) as HeadlessResult;
  } catch {
    throw new JudgeError("Claude Code returned output that is not JSON");
  }
  if (res.is_error) {
    throw new JudgeError(`Claude Code reported an error: ${String(res.result ?? "").slice(0, 200)}`);
  }
  const parsed = CriteriaSchema.safeParse(res.structured_output);
  if (!parsed.success) throw new JudgeError("the model returned no usable criteria");
  return parsed.data.criteria.map((c) => c.description);
}

async function viaApi(prompt: string): Promise<string[]> {
  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model: helperModel(),
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(CriteriaSchema) },
    });
  } catch (err) {
    throw new JudgeError(
      `model call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!response.parsed_output) throw new JudgeError("the model returned no usable criteria");
  return response.parsed_output.criteria.map((c) => c.description);
}

/** Throws rather than return something weak: a bad suggestion may be accepted
 *  without a close read, and the panel then judges it in earnest. */
export async function suggestCriteria(req: CriteriaRequest): Promise<string[]> {
  if (!helperAvailable()) {
    throw Object.assign(
      new Error("criteria suggestions are not enabled on this deployment"),
      { statusCode: 503 }
    );
  }
  const prompt = buildPrompt(req);
  const criteria =
    process.env.DESC_JUDGE === "claude-api"
      ? await viaApi(prompt)
      : await viaClaudeCode(prompt);

  // These land straight in the form's inputs.
  return criteria
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX);
}
