/**
 * End-to-end check for the deliverable flow:
 *   create → fund → accept → submit deliverable.
 * Verifies the escrow goes `submitted` and the stored deliverable hash equals
 * sha256(payload) — the off-chain↔on-chain bridge.
 *
 * Prereq: validator + program, bootstrap done, db:push done, api running.
 * Run: `pnpm e2e:submit`.
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
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { deliverBundle, getJson } from "./_shared";

const expand = (p: string) => (p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const BASE = `http://localhost:${process.env.PORT ?? "3000"}`;
const USDC_MINT = new PublicKey(process.env.USDC_MINT!);
const AUTHORITY_PATH = expand(
  process.env.AUTHORITY_KEYPAIR_PATH ?? "~/.config/solana/id.json"
);
const loadKeypair = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res.json();
}

async function signAndSubmit(unsignedTx: string, signer: Keypair, path: string) {
  const tx = Transaction.from(Buffer.from(unsignedTx, "base64"));
  tx.partialSign(signer);
  return postJson(path, { signedTx: tx.serialize().toString("base64") });
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
  await mintTo(connection, mintAuthority, USDC_MINT, ata.address, mintAuthority, 1_050_000_000);

  // create → fund
  const created = (await postJson("/contracts", {
    initiator: initiator.publicKey.toBase58(),
    title: "Implement token vesting program",
    brief: "Linear vesting with a cliff; merged PR.",
    deliverableType: "mergeable",
    acceptanceCriteria: [{ description: "PR merged into main" }],
    amount: "1000000000",
    moderatorCount: 3,
    moderatorSurcharge: "30000000",
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  })) as { id: string; unsignedTx: string };
  const funded = (await signAndSubmit(
    created.unsignedTx,
    initiator,
    `/contracts/${created.id}/submit`
  )) as { linkToken: string };
  const token = funded.linkToken;

  // accept
  const acceptPrep = (await postJson(`/links/${token}/accept/prepare`, {
    committer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  await signAndSubmit(acceptPrep.unsignedTx, committer, `/links/${token}/accept/submit`);

  // submit deliverable
  const delivered = await deliverBundle(token, committer);
  const submitted = (await getJson(`/contracts/${created.id}`)) as {
    status: string;
    deliverable: { deliverableHash: string } | null;
  };

  console.log("after submit → status:", submitted.status);
  console.log("deliverable hash:", submitted.deliverable?.deliverableHash);

  if (submitted.status !== "submitted") {
    throw new Error("expected submitted, got " + submitted.status);
  }
  // the hash the chain anchored must equal the one the client computed locally
  if (submitted.deliverable?.deliverableHash !== delivered.deliverableHash) {
    throw new Error(
      `hash mismatch: ${submitted.deliverable?.deliverableHash} != ${delivered.deliverableHash}`
    );
  }
  console.log("\n✅ create → fund → accept → submit flow OK (hash verified)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
