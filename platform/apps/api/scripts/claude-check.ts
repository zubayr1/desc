/**
 * Verifies that this machine can actually reach Claude, and reports what a call
 * costs. Run it after `ant auth login` and any time auth starts misbehaving.
 *
 * Deliberately constructs a BARE client: with no arguments the SDK resolves the
 * OAuth profile written by `ant auth login` and refreshes the short-lived token
 * on its own. Passing a token through the environment instead would work for
 * about eight hours and then fail in a way that looks nothing like an auth bug.
 */
import Anthropic from "@anthropic-ai/sdk";

// Opus 5 pricing, USD per million tokens — used to price a check, and later to
// price a verdict once moderation fees scale with the work done.
const IN_PER_MTOK = 5;
const OUT_PER_MTOK = 25;

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key === "") {
    console.error(
      "ANTHROPIC_API_KEY is set but EMPTY. It still wins over the `ant auth login`\n" +
        "profile and authenticates as an empty key. Comment the line out or fill it in."
    );
    process.exit(1);
  }
  console.log(`auth:    ${key ? "ANTHROPIC_API_KEY" : "ant auth login profile"}`);

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 64,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with exactly: ok" }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const { input_tokens: i, output_tokens: o } = res.usage;
  const cost = (i / 1e6) * IN_PER_MTOK + (o / 1e6) * OUT_PER_MTOK;

  console.log(`model:   ${res.model}`);
  console.log(`replied: ${text.trim()}`);
  console.log(`tokens:  ${i} in / ${o} out`);
  console.log(`cost:    $${cost.toFixed(6)}`);
  console.log("\nClaude is reachable — the OAuth profile works from Node.");
}

main().catch((err) => {
  console.error("\nFAILED:", err?.message ?? err);
  console.error(
    "\nCheck `ant auth status`. Common causes: the profile expired (re-run" +
      " `ant auth login`), or ANTHROPIC_API_KEY is set and shadowing it."
  );
  process.exit(1);
});
