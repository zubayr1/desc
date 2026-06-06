/**
 * End-to-end check for the accept flow: create → fund → accept (via link).
 * Verifies the escrow goes `active` with the committer bound on-chain.
 *
 * Prereq: validator + program, bootstrap done, db:push done, api running.
 * Run: `pnpm e2e:accept`.
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

async function signAndSubmit(
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
  const committer = Keypair.generate();

  // Fund initiator (SOL + 1050 USDC) and committer (SOL for gas).
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
    deliverableType: "merged_pr",
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
  )) as { status: string; linkToken: string };
  console.log("funded → status:", funded.status, "link:", funded.linkToken);

  // committer opens the link → review
  const review = (await (await fetch(`${BASE}/links/${funded.linkToken}`)).json()) as {
    status: string;
    title: string;
  };
  console.log("committer sees:", review.title, "(" + review.status + ")");

  // accept
  const prep = (await postJson(`/links/${funded.linkToken}/accept/prepare`, {
    committer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  const active = (await signAndSubmit(
    prep.unsignedTx,
    committer,
    `/links/${funded.linkToken}/accept/submit`
  )) as { status: string; committer: string };

  console.log("after accept → status:", active.status, "committer:", active.committer);

  if (active.status !== "active") throw new Error("expected active, got " + active.status);
  if (active.committer !== committer.publicKey.toBase58()) {
    throw new Error("committer not bound correctly");
  }
  console.log("\n✅ create → fund → accept flow OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
