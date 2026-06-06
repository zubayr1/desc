/**
 * End-to-end check for the create → fund flow against a running api + localnet.
 *
 * Prereq: validator + program deployed, `pnpm bootstrap` done, `pnpm db:push`
 * done, and the api running (`pnpm dev`). Then: `pnpm e2e`.
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

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const mintAuthority = loadKeypair(AUTHORITY_PATH); // created the mint in bootstrap
  const initiator = Keypair.generate();

  // Fund the initiator with SOL (gas) + USDC (amount + fee + surcharge = 1050).
  const air = await connection.requestAirdrop(initiator.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(air, "confirmed");
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    initiator,
    USDC_MINT,
    initiator.publicKey
  );
  await mintTo(connection, mintAuthority, USDC_MINT, ata.address, mintAuthority, 1_050_000_000);
  console.log("initiator:", initiator.publicKey.toBase58());

  // 1. POST /contracts → unsigned tx
  const createBody = {
    initiator: initiator.publicKey.toBase58(),
    title: "Implement token vesting program",
    brief: "Linear vesting with a configurable cliff; deliver as a merged PR.",
    deliverableType: "merged_pr",
    acceptanceCriteria: [
      { description: "PR merged into main of the repo" },
      { description: "All vesting tests pass in CI" },
    ],
    amount: "1000000000",
    moderatorCount: 3,
    moderatorSurcharge: "30000000",
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  };
  const createRes = await fetch(`${BASE}/contracts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(createBody),
  });
  if (!createRes.ok) throw new Error("create failed: " + (await createRes.text()));
  const created = (await createRes.json()) as {
    id: string;
    contractId: string;
    escrowAddress: string;
    unsignedTx: string;
  };
  console.log("created:", created.id, "escrow:", created.escrowAddress);

  // 2. Sign the unsigned tx with the initiator wallet
  const tx = Transaction.from(Buffer.from(created.unsignedTx, "base64"));
  tx.partialSign(initiator);
  const signedTx = tx.serialize().toString("base64");

  // 3. POST /submit → funds + mints link token
  const submitRes = await fetch(`${BASE}/contracts/${created.id}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedTx }),
  });
  if (!submitRes.ok) throw new Error("submit failed: " + (await submitRes.text()));
  const contract = (await submitRes.json()) as { status: string; linkToken: string };
  console.log("submitted → status:", contract.status, "link:", contract.linkToken);

  // 4. GET → read back the merged view
  const fetched = (await (await fetch(`${BASE}/contracts/${created.id}`)).json()) as {
    status: string;
  };
  if (fetched.status !== "funded") {
    throw new Error("expected funded, got " + fetched.status);
  }
  console.log("\n✅ create → fund flow OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
