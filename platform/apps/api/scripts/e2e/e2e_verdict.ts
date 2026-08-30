/**
 * End-to-end check for the verdict flow:
 *   create → fund → accept → submit → record_verdict (admin/API-signed).
 * Verifies the outcome is set to `pass` while status stays `submitted`
 * (record_verdict attests only — it moves no money).
 *
 * Prereq: validator + program, bootstrap done, db:push done, api running.
 * Run: `pnpm e2e:verdict`.
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
import { deliverBundle, recordVerdict, getJson } from "./_shared";

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

  // create → fund → accept → submit
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

  // the moderator signs its own verdict; the api holds no key that can
  await recordVerdict(created.escrowAddress, "pass");
  const judged = (await getJson(`/contracts/${created.id}`)) as {
    status: string;
    outcome: string | null;
  };

  console.log("after verdict → status:", judged.status, "outcome:", judged.outcome);

  if (judged.outcome !== "pass") throw new Error("expected outcome pass");
  if (judged.status !== "submitted") {
    throw new Error("expected status to stay submitted, got " + judged.status);
  }

  // sanity: appears in the read-only oversight list (bearer-gated)
  const res = await fetch(`${BASE}/admin/contracts`, {
    headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN ?? ""}` },
  });
  if (!res.ok) throw new Error(`admin list failed: ${await res.text()}`);
  const queue = (await res.json()) as Array<{ id: string }>;
  if (!queue.find((c) => c.id === created.id)) {
    throw new Error("contract missing from the admin list");
  }

  console.log("\n✅ create → fund → accept → submit → verdict flow OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
