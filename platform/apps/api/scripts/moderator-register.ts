/**
 * Register a moderator: generate an age keypair, store the PUBLIC recipient in
 * the registry, and print the SECRET identity to hand to that moderator's
 * service. Run once per moderator (decentralization = run it ≥2×).
 *
 *   pnpm --filter api moderator-register "Mod A"
 */
import { generateModerationKeypair } from "@repo/shared";
import { addModerator } from "../src/moderators/repo";

const label = process.argv[2] ?? "Moderator";
const { identity, recipient } = await generateModerationKeypair();
const row = await addModerator(recipient, label);

console.log(`\nRegistered moderator "${label}" (${row.id}) — now active.`);
console.log("  recipient (public, stored in DB):");
console.log("    " + recipient);
console.log("\n  SECRET identity — give ONLY to this moderator's service");
console.log("  (its MODERATION_IDENTITY_PATH file); never commit it:");
console.log("    " + identity + "\n");

process.exit(0);
