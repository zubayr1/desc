/**
 * Tiebreakers, end to end, with a 20-second verdict window:
 *
 *   A. 1 PASS, 1 FAIL, 1 silent → a tiebreaker takes the silent seat and
 *      decides → release. The tiebreaker earns that seat's fee; the silent
 *      moderator gets `missed +1`.
 *   B. all three silent → two tiebreakers split → Inconclusive → one-click
 *      refund (finalize + refund) → the initiator can't fetch the work.
 *
 * Votes and tiebreaks are signed directly, like every e2e — no watchers. Stop
 * `mod-watch` / `tiebreak-watch` while it runs.
 *
 * Prereq: the usual e2e setup, 3 moderators, and `pnpm tiebreaker-register`.
 * Run: `pnpm e2e:tiebreak`.
 */
import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import type { DescEscrow } from "../../src/solana/idl/desc_escrow";
import escrowIdl from "../../src/solana/idl/desc_escrow.json";
import { moderatorReputationPda } from "../../src/solana/program";
import { usdcMint } from "../../src/config/cluster";
import {
  BASE,
  RPC,
  AUTHORITY_PATH,
  loadKeypair,
  getJson,
  postJson,
  signAndSubmit,
  deliverBundle,
  commitVerdict,
  revealVerdict,
  tiebreak,
  panelSeats,
  pickPanel,
  verdictDeadlines,
  waitPastChain,
  withVerdictWindow,
  fundSol,
} from "./_shared";

const USDC_MINT = new PublicKey(usdcMint());
const AMOUNT = 1_000_000_000;
const FUNDING = 1_200_000_000;
const WINDOW = 20;

const connection = new Connection(RPC, "confirmed");
const reader = new Program<DescEscrow>(
  escrowIdl as DescEscrow,
  new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" })
);

const balance = async (owner: PublicKey): Promise<bigint> => {
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(USDC_MINT, owner))).amount;
  } catch {
    return 0n;
  }
};
const missed = async (w: PublicKey) =>
  (await reader.account.moderatorReputation.fetch(moderatorReputationPda(w))).missed;

interface Live {
  status: string;
  outcome: string | null;
  verdict?: { phase: string } | null;
  panel: { wallet: string; vote?: string | null; filledBy?: string; filledByLabel?: string }[];
}

/** A funded, accepted, delivered contract on a panel of 3. */
async function submitted(title: string) {
  const mintAuthority = loadKeypair(AUTHORITY_PATH);
  const initiator = Keypair.generate();
  const committer = Keypair.generate();
  await fundSol([initiator.publicKey, committer.publicKey], 2);
  const ata = await getOrCreateAssociatedTokenAccount(connection, initiator, USDC_MINT, initiator.publicKey);
  await mintTo(connection, mintAuthority, USDC_MINT, ata.address, mintAuthority, FUNDING);

  const panel = await pickPanel(3);
  const created = (await postJson("/contracts", {
    initiator: initiator.publicKey.toBase58(),
    title,
    brief: "e2e tiebreak",
    deliverableType: "mergeable",
    acceptanceCriteria: [{ description: "PR merged into main" }],
    amount: String(AMOUNT),
    moderators: panel.map((m) => m.wallet),
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  })) as { id: string; escrowAddress: string; unsignedTx: string };
  const { linkToken } = (await signAndSubmit(created.unsignedTx, initiator, `/contracts/${created.id}/submit`)) as {
    linkToken: string;
  };
  const accept = (await postJson(`/links/${linkToken}/accept/prepare`, {
    committer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  await signAndSubmit(accept.unsignedTx, committer, `/links/${linkToken}/accept/submit`);
  await deliverBundle(linkToken, committer);

  const seats = await panelSeats(created.escrowAddress);
  return { id: created.id, escrow: created.escrowAddress, initiator, committer, seats };
}

async function decidedByTiebreaker() {
  console.log("\n── A: 1 PASS · 1 FAIL · 1 silent → tiebreaker decides ──");
  const c = await submitted("Split panel, one silent");
  const [a, b, silent] = c.seats;
  const missedBefore = await missed(silent.wallet);

  await commitVerdict(c.escrow, "pass", a.wallet);
  await commitVerdict(c.escrow, "fail", b.wallet);
  const d = await verdictDeadlines(c.escrow);
  await waitPastChain(d.commit);
  await revealVerdict(c.escrow, "pass", a.wallet);
  await revealVerdict(c.escrow, "fail", b.wallet);
  await waitPastChain(d.reveal);

  let live = await getJson<Live>(`/contracts/${c.id}`);
  if (live.outcome !== null || live.verdict?.phase !== "tiebreak") {
    throw new Error(`expected an open tiebreak, got outcome ${live.outcome} / phase ${live.verdict?.phase}`);
  }
  const t = await tiebreak(c.escrow, "pass");
  live = await getJson<Live>(`/contracts/${c.id}`);
  if (live.outcome !== "pass") throw new Error(`the tiebreaker's PASS should decide it, got ${live.outcome}`);
  if (live.panel[2]?.filledBy !== t.toBase58()) throw new Error("the api should show the tiebreaker on seat 3");
  if (!live.panel[2]?.filledByLabel?.startsWith("Tiebreaker")) throw new Error("the api should name the tiebreaker");
  console.log(`${live.panel[2].filledByLabel} filled seat 3 → PASS`);

  const before = await balance(t);
  const rel = (await postJson(`/contracts/${c.id}/release/prepare`, {
    signer: c.committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  const settled = (await signAndSubmit(rel.unsignedTx, c.committer, `/contracts/${c.id}/release/submit`)) as {
    status: string;
  };
  if (settled.status !== "settled") throw new Error(`expected settled, got ${settled.status}`);

  const earned = (await balance(t)) - before;
  if (earned !== silent.fee) throw new Error(`tiebreaker should earn the silent seat's fee ${silent.fee}, got ${earned}`);
  const missedAfter = await missed(silent.wallet);
  if (missedAfter !== missedBefore + 1) throw new Error(`silent moderator missed ${missedBefore} → ${missedAfter}, expected +1`);
  console.log(`released · tiebreaker +${earned} · silent moderator missed ${missedBefore} → ${missedAfter}`);
}

async function inconclusive() {
  console.log("\n── B: all silent → two tiebreakers split → Inconclusive ──");
  const c = await submitted("Silent panel");
  const d = await verdictDeadlines(c.escrow);
  await waitPastChain(d.reveal);

  await tiebreak(c.escrow, "pass");
  await tiebreak(c.escrow, "fail");
  const live = await getJson<Live>(`/contracts/${c.id}`);
  if (live.outcome !== null || live.verdict?.phase !== "finalizable") {
    throw new Error(`expected finalizable, got outcome ${live.outcome} / phase ${live.verdict?.phase}`);
  }
  console.log("two tiebreaks split, cap reached → finalizable");

  const voterFees = c.seats[0].fee + c.seats[1].fee;
  const prep = (await postJson(`/contracts/${c.id}/refund/prepare`, {})) as { unsignedTx: string };
  const refunded = (await signAndSubmit(prep.unsignedTx, c.initiator, `/contracts/${c.id}/refund/submit`)) as {
    status: string;
    outcome: string | null;
  };
  if (refunded.status !== "refunded" || refunded.outcome !== "inconclusive") {
    throw new Error(`expected refunded + inconclusive, got ${refunded.status} / ${refunded.outcome}`);
  }

  const expected = BigInt(FUNDING) - voterFees;
  const got = await balance(c.initiator.publicKey);
  if (got !== expected) throw new Error(`initiator should hold ${expected} (all but the two voters' fees), got ${got}`);
  console.log(`one-click refund: finalize + refund · initiator back to ${got} (protocol kept nothing)`);

  const res = await fetch(`${BASE}/contracts/${c.id}/deliverable/ciphertext`);
  if (res.status !== 409) throw new Error(`the initiator must not get the work after Inconclusive, got ${res.status}`);
  console.log("ciphertext refused after Inconclusive ✓");
}

async function main() {
  await withVerdictWindow(WINDOW, async () => {
    await decidedByTiebreaker();
    await inconclusive();
  });
  console.log("\n✅ tiebreakers: a split is decided, a dead panel ends Inconclusive and refunds");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
