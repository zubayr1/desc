/**
 * End-to-end check for the cancel flow: create → fund → cancel.
 * Verifies the initiator is fully refunded and the contract is `cancelled`.
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

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const BASE = `http://localhost:${process.env.PORT ?? "3000"}`;
const USDC_MINT = new PublicKey(process.env.USDC_MINT!);
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const loadKeypair = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

const TOTAL = 1_050_000_000; // amount 1000 + fee 20 + surcharge 30

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res.json();
}

async function signAndSubmit(
  connection: Connection,
  unsignedTx: string,
  signer: Keypair,
  submitPath: string
) {
  const tx = Transaction.from(Buffer.from(unsignedTx, "base64"));
  tx.partialSign(signer);
  return postJson(submitPath, { signedTx: tx.serialize().toString("base64") });
}

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
    deliverableType: "merged_pr",
    acceptanceCriteria: [{ description: "n/a" }],
    amount: "1000000000",
    moderatorCount: 3,
    moderatorSurcharge: "30000000",
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  })) as { id: string; unsignedTx: string };
  await signAndSubmit(connection, created.unsignedTx, initiator, `/contracts/${created.id}/submit`);

  // after funding, the initiator's USDC is in the vault → balance 0
  const afterFund = await getAccount(connection, ata.address);
  console.log("after fund, initiator USDC:", afterFund.amount.toString());

  // cancel
  const prep = (await postJson(`/contracts/${created.id}/cancel/prepare`, {})) as {
    unsignedTx: string;
  };
  const cancelled = (await signAndSubmit(
    connection,
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
  console.log("\n✅ create → fund → cancel flow OK (full refund)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
