/**
 * Which Claude model each moderator judges with — configured in `.env`, one
 * line per moderator, keyed by its slug (the label lower-cased with dashes):
 *
 *   MODEL_OLYMPUS_MOD_CLAUDE_OPUS=claude-opus-5
 *   MODEL_HIKARU_MOD_CLAUDE_HAIKU=claude-haiku-4-5
 *   MODEL_SONGOKU_MOD_CLAUDE_SONNET=claude-sonnet-5
 *   MODEL_MISCHIEF=claude-haiku-4-5
 *
 * The model is how a moderator RUNS, not what it charges, so it stays
 * off-chain. There is no silent default: a moderator with no model configured
 * refuses to start, rather than quietly judging with a model (and cost) you
 * never chose for it.
 */

/** `hikaru-mod-claude-haiku` → `MODEL_HIKARU_MOD_CLAUDE_HAIKU` */
export const modelEnvName = (slug: string) =>
  `MODEL_${slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

export function moderatorModel(slug: string): string {
  const name = modelEnvName(slug);
  const model = process.env[name]?.trim();
  if (!model) {
    throw new Error(
      `no model set for moderator "${slug}" — add ${name}=<model id> to .env (e.g. claude-opus-5)`
    );
  }
  return model;
}
