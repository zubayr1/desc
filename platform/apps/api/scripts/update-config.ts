/**
 * Admin CLI to update the on-chain protocol Config. Signed by the COLD
 * authority — NOT an API endpoint (the server never holds the cold key).
 *
 * Examples:
 *   pnpm update-config --pause
 *   pnpm update-config --unpause
 *   pnpm update-config --fee-bps 250
 *   pnpm update-config --treasury <PUBKEY>
 *   pnpm update-config --settlement <PUBKEY>
 *   pnpm update-config --fee-bps 150 --pause       (combine)
 *
 * Prereq: validator running with the program + Config initialized.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { DescEscrow } from "../src/solana/idl/desc_escrow";
import idl from "../src/solana/idl/desc_escrow.json";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  // Build the Option args — null means "leave unchanged".
  const settlement = val("--settlement");
  const treasury = val("--treasury");
  const feeBps = val("--fee-bps");
  const paused = has("--pause") ? true : has("--unpause") ? false : null;

  const settlementArg = settlement ? new PublicKey(settlement) : null;
  const treasuryArg = treasury ? new PublicKey(treasury) : null;
  const feeArg = feeBps !== undefined ? Number(feeBps) : null;

  if (!settlementArg && !treasuryArg && feeArg === null && paused === null) {
    console.error(
      "Nothing to update. Flags: --settlement <pk> --treasury <pk> --fee-bps <n> --pause --unpause"
    );
    process.exit(1);
  }

  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(AUTHORITY_PATH, "utf8")))
  );
  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: "confirmed",
  });
  const program = new Program<DescEscrow>(idl as DescEscrow, provider);

  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .updateConfig(settlementArg, treasuryArg, feeArg, paused)
    .accountsPartial({ authority: authority.publicKey, config })
    .rpc();

  const cfg = await program.account.config.fetch(config);
  console.log("Config updated:");
  console.log("  settlementAuthority:", cfg.settlementAuthority.toBase58());
  console.log("  treasury           :", cfg.treasury.toBase58());
  console.log("  protocolFeeBps     :", cfg.protocolFeeBps);
  console.log("  paused             :", cfg.paused);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
