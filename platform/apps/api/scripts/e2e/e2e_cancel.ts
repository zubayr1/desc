/**
 * End-to-end check for the cancel flow: create → fund → cancel.
 * Verifies the initiator is fully refunded, the contract is `cancelled`, and the
 * panel account is closed — its rent is a deposit the initiator put up at
 * creation, and an unclosed panel strands it on chain for ever.
 *
 * Prereq: validator + program, bootstrap done, db:push done, api running.
 * Run: `pnpm e2e:cancel`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import {
  accountExists,
  panelAddress,
  pickModerator,
  postJson,
  signAndSubmit,
} from "./_shared";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const BASE = `http://localhost:${process.env.PORT ?? "3000"}`;
const USDC_MINT = new PublicKey(process.env.USDC_MINT!);
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const loadKeypair = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

const TOTAL = 1_070_000_000; // amount 1000 + fee 20 + moderator price (up to 5% = 50)

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const mintAuthority = loadKeypair(AUTHORITY_PATH);
  const initiator = Keypair.generate();

  // Fund initiator: SOL + exactly TOTAL USDC.
  const air = await connection.requestAirdrop(initiator.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(air, "confirmed");
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    initiator,
    USDC_MINT,
    initiator.publicKey
  );
  await mintTo(connection, mintAuthority, USDC_MINT, ata.address, mintAuthority, TOTAL);

  // create → fund
  const created = (await postJson("/contracts", {
    initiator: initiator.publicKey.toBase58(),
    title: "Throwaway deal to cancel",
    brief: "Will be cancelled before any committer accepts.",
    deliverableType: "mergeable",
    acceptanceCriteria: [{ description: "n/a" }],
    amount: "1000000000",
    moderator: await pickModerator(),
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  })) as { id: string; escrowAddress: string; unsignedTx: string };
  await signAndSubmit(created.unsignedTx, initiator, `/contracts/${created.id}/submit`);

  // after funding, the initiator's USDC is in the vault → balance 0
  const afterFund = await getAccount(connection, ata.address);
  console.log("after fund, initiator USDC:", afterFund.amount.toString());

  // cancel
  const prep = (await postJson(`/contracts/${created.id}/cancel/prepare`, {})) as {
    unsignedTx: string;
  };
  // The panel exists from creation — cancel has to close it, or the rent the
  // initiator put up is stranded on chain for ever.
  const panel = panelAddress(new PublicKey(created.escrowAddress));
  if (!(await accountExists(panel))) {
    throw new Error("no panel account was created for this escrow");
  }
  const solBefore = await connection.getBalance(initiator.publicKey);

  const cancelled = (await signAndSubmit(
        prep.unsignedTx,
    initiator,
    `/contracts/${created.id}/cancel/submit`
  )) as { status: string };

  const afterCancel = await getAccount(connection, ata.address);
  console.log("after cancel, status:", cancelled.status, "initiator USDC:", afterCancel.amount.toString());

  if (cancelled.status !== "cancelled") throw new Error("expected cancelled");
  if (afterCancel.amount.toString() !== String(TOTAL)) {
    throw new Error(`expected full refund ${TOTAL}, got ${afterCancel.amount}`);
  }

  if (await accountExists(panel)) {
    throw new Error("panel account survived cancel — its rent is stranded");
  }
  // Rent back, minus the transaction fee the initiator just paid. Only the sign
  // matters: the vault's and the panel's rent together are ~0.005 SOL, and a
  // signature is 0.000005, so a net gain can only mean both closes landed.
  const solAfter = await connection.getBalance(initiator.publicKey);
  console.log(
    "panel closed ✓ · initiator SOL:",
    (solBefore / LAMPORTS_PER_SOL).toFixed(6),
    "→",
    (solAfter / LAMPORTS_PER_SOL).toFixed(6)
  );
  if (solAfter <= solBefore) {
    throw new Error("initiator did not get the vault + panel rent back");
  }

  console.log("\n✅ create → fund → cancel flow OK (full refund, panel closed)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
