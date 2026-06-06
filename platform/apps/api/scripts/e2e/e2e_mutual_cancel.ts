/**
 * End-to-end check for the mutual-cancel flow (two signers):
 *   create → fund → accept → mutual_cancel (both sign).
 * Verifies the escrow is `refunded` and the initiator gets the full deposit back.
 *
 * Prereq: validator + program, bootstrap done, db:push done, api running.
 * Run: `pnpm e2e:mutual-cancel`.
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

const TOTAL = 1_050_000_000;

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const mintAuthority = loadKeypair(AUTHORITY_PATH);
  const initiator = Keypair.generate();
  const committer = Keypair.generate();

  for (const kp of [initiator, committer]) {
    const air = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(air, "confirmed");
  }
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
    title: "Deal both sides call off",
    brief: "Mutually agreed to unwind after acceptance.",
    deliverableType: "merged_pr",
    acceptanceCriteria: [{ description: "n/a" }],
    amount: "1000000000",
    moderatorCount: 3,
    moderatorSurcharge: "30000000",
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  })) as { id: string; unsignedTx: string };

  const fundTx = Transaction.from(Buffer.from(created.unsignedTx, "base64"));
  fundTx.partialSign(initiator);
  const funded = (await postJson(`/contracts/${created.id}/submit`, {
    signedTx: fundTx.serialize().toString("base64"),
  })) as { linkToken: string };
  const token = funded.linkToken;

  // accept
  const acceptPrep = (await postJson(`/links/${token}/accept/prepare`, {
    committer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  const acceptTx = Transaction.from(Buffer.from(acceptPrep.unsignedTx, "base64"));
  acceptTx.partialSign(committer);
  await postJson(`/links/${token}/accept/submit`, {
    signedTx: acceptTx.serialize().toString("base64"),
  });

  // mutual cancel — BOTH parties sign the one tx
  const prep = (await postJson(`/contracts/${created.id}/mutual-cancel/prepare`, {})) as {
    unsignedTx: string;
  };
  const tx = Transaction.from(Buffer.from(prep.unsignedTx, "base64"));
  tx.partialSign(initiator);
  tx.partialSign(committer);
  const refunded = (await postJson(`/contracts/${created.id}/mutual-cancel/submit`, {
    signedTx: tx.serialize().toString("base64"),
  })) as { status: string };

  const balance = (await getAccount(connection, ata.address)).amount;
  console.log("after mutual-cancel → status:", refunded.status, "initiator USDC:", balance.toString());

  if (refunded.status !== "refunded") throw new Error("expected refunded, got " + refunded.status);
  if (balance.toString() !== String(TOTAL)) {
    throw new Error(`expected full refund ${TOTAL}, got ${balance}`);
  }
  console.log("\n✅ create → fund → accept → mutual_cancel flow OK (two signers)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
