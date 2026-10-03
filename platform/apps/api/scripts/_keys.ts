import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Keypair } from "@solana/web3.js";

/**
 * Where the scripts find the admin keypair.
 *
 * Every script and e2e flow used to carry its own copy of these three — the
 * tilde expansion, the path, and the file-to-Keypair read — so a change to how
 * the admin key is located meant editing fourteen files.
 */

/** `~/foo` → `/home/you/foo`. Node does not expand it; the shell usually has. */
export const expand = (p: string) =>
  p.startsWith("~") ? p.replace(/^~/, homedir()) : p;

/** The cold admin / deployer key. Seeds the config PDAs and signs admin calls. */
export const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);

/** Read a Solana CLI keypair file (a JSON array of bytes). */
export const loadKeypair = (path: string): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(expand(path), "utf8"))));
