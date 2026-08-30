/**
 * End-to-end check for the refund flow (Fail verdict path):
 *   create → fund → accept → submit → verdict(fail) → refund.
 * Verifies the escrow is `refunded` and the initiator gets the deposit back less
 * the moderator surcharge and the verification fee (both earned once a verdict
 * was rendered). Reads the expected split off the contract rather than assuming.
 *
 * Prereq: validator + program, bootstrap done, db:push done, api running.
 * Run: `pnpm e2e:refund`.
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
import { deliverBundle, recordVerdict } from "./_shared";

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
  await mintTo(connection, mintAuthority, USDC_MINT, ata.address, mintAuthority, TOTAL);

  // create → fund → accept → submit
  const created = (await postJson("/contracts", {
    initiator: initiator.publicKey.toBase58(),
    title: "Deal that will fail review",
    brief: "Committer submits, but the verdict is Fail.",
    deliverableType: "mergeable",
    acceptanceCriteria: [{ description: "PR merged into main" }],
    amount: "1000000000",
    moderatorCount: 3,
    moderatorSurcharge: "30000000",
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  })) as { id: string; escrowAddress: string; unsignedTx: string };
  const funded = (await signAndSubmit(
    created.unsignedTx,
    initiator,
    `/contracts/${created.id}/submit`
  )) as { linkToken: string };
  const token = funded.linkToken;

  const acceptPrep = (await postJson(`/links/${token}/accept/prepare`, {
    committer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  await signAndSubmit(acceptPrep.unsignedTx, committer, `/links/${token}/accept/submit`);

  await deliverBundle(token, committer);

  // verdict: fail — signed by the registered moderator
  await recordVerdict(created.escrowAddress, "fail");

  // refund — initiator reclaims
  const refPrep = (await postJson(`/contracts/${created.id}/refund/prepare`, {})) as {
    unsignedTx: string;
  };
  const refunded = (await signAndSubmit(
    refPrep.unsignedTx,
    initiator,
    `/contracts/${created.id}/refund/submit`
  )) as { status: string; moderatorSurcharge: string; verificationFee: string };

  const balance = (await getAccount(connection, ata.address)).amount;
  console.log("after refund → status:", refunded.status, "initiator USDC:", balance.toString());

  if (refunded.status !== "refunded") throw new Error("expected refunded, got " + refunded.status);
  // A Fail verdict earns the moderator its surcharge and the treasury the
  // verification fee; everything else comes back.
  const expected =
    BigInt(TOTAL) - BigInt(refunded.moderatorSurcharge) - BigInt(refunded.verificationFee);
  if (balance !== expected) {
    throw new Error(`expected refund of ${expected}, got ${balance}`);
  }
  console.log("\n✅ create → fund → accept → submit → verdict(fail) → refund flow OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
