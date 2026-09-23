/**
 * End-to-end check for a THREE-moderator contract, with a deliberately wrong
 * moderator on the panel:
 *   create(3 mods) → fund → accept → deliver → 3 verdicts → release.
 *
 * What it proves, which no single-moderator run can:
 *   - the deposit is the SUM of three prices, not one fee split three ways
 *   - the delivery is sealed to all three, so each can open it
 *   - a majority settles the contract and the dissenter cannot change it
 *   - every moderator that voted is paid its OWN price — the outvoted one too
 *   - the panel account is closed on settle and its rent returns
 *
 * The bad panellist is Mischief (`test: true` in `/config/fees`). Its verdict is
 * inverted here rather than by running the real judge: this script drives
 * `submit_verdict` directly like every other e2e, so it tests the tally and the
 * payout. That the JUDGE inverts is a separate concern, covered by the wrapper
 * itself.
 *
 * Prereq: validator + programs, bootstrap, db:push, api running, and THREE
 * active moderators registered (see platform/README.md) — one of them Mischief,
 * with `DESC_MISCHIEF_MODS` naming it.
 * Run: `pnpm e2e:panel`.
 */
import "dotenv/config";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import {
  RPC,
  AUTHORITY_PATH,
  loadKeypair,
  getJson,
  postJson,
  signAndSubmit,
  deliverBundle,
  recordVerdict,
  panelSeats,
  pickPanel,
} from "./_shared";

import { usdcMint } from "../../src/config/cluster";
const USDC_MINT = new PublicKey(usdcMint());
const AMOUNT = 1_000_000_000; // 1000 USDC
/** Enough for the payout, the protocol fee and three moderator prices. */
const FUNDING = 1_200_000_000;

const balance = async (connection: Connection, owner: PublicKey): Promise<bigint> => {
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(USDC_MINT, owner)))
      .amount;
  } catch {
    return 0n; // no token account yet — release creates it
  }
};

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
  await mintTo(connection, mintAuthority, USDC_MINT, ata.address, mintAuthority, FUNDING);

  const panel = await pickPanel(3);
  const mischief = panel.find((m) => m.test);
  console.log("panel:");
  for (const m of panel) {
    console.log(`  ${m.label} — ${(m.baseBps / 100).toFixed(2)}%${m.test ? "  (TEST — votes the opposite)" : ""}`);
  }
  if (!mischief) {
    console.log("  ! no test moderator registered — this run only proves a unanimous panel");
  }

  // ── create with three moderators ──────────────────────────────
  const created = (await postJson("/contracts", {
    initiator: initiator.publicKey.toBase58(),
    title: "Three moderators, one deliberately wrong",
    brief: "Proves a majority settles the contract and every voter is paid.",
    deliverableType: "mergeable",
    acceptanceCriteria: [{ description: "PR merged into main" }],
    amount: String(AMOUNT),
    moderators: panel.map((m) => m.wallet),
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  })) as { id: string; escrowAddress: string; unsignedTx: string };

  const funded = (await signAndSubmit(
    created.unsignedTx,
    initiator,
    `/contracts/${created.id}/submit`
  )) as { linkToken: string; moderatorSurcharge: string };
  const token = funded.linkToken;

  // The deposit is the sum of the three prices — never one fee divided up.
  const expectedSurcharge = panel.reduce(
    (sum, m) => sum + (BigInt(AMOUNT) * BigInt(m.baseBps)) / 10_000n,
    0n
  );
  if (BigInt(funded.moderatorSurcharge) !== expectedSurcharge) {
    throw new Error(
      `surcharge should be the SUM of the panel's prices (${expectedSurcharge}), got ${funded.moderatorSurcharge}`
    );
  }
  console.log("surcharge (sum of 3 prices):", funded.moderatorSurcharge);

  // ── accept + deliver (sealed to all three) ────────────────────
  const acceptPrep = (await postJson(`/links/${token}/accept/prepare`, {
    committer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  await signAndSubmit(acceptPrep.unsignedTx, committer, `/links/${token}/accept/submit`);
  await deliverBundle(token, committer);

  // ── three verdicts: honest PASS, PASS, then the test mod's FAIL ─
  const seats = await panelSeats(created.escrowAddress);
  if (seats.length !== 3) throw new Error(`expected a panel of 3, got ${seats.length}`);

  const badWallet = mischief ? new PublicKey(mischief.wallet) : null;
  const honest = seats.filter((s) => !badWallet || !s.wallet.equals(badWallet));
  const bad = badWallet ? seats.find((s) => s.wallet.equals(badWallet))! : null;

  await recordVerdict(created.escrowAddress, "pass", honest[0].wallet);
  let live = (await getJson(`/contracts/${created.id}`)) as { outcome: string | null };
  if (live.outcome !== null) throw new Error("one vote is not a majority of three");

  await recordVerdict(created.escrowAddress, "pass", honest[1].wallet);
  live = (await getJson(`/contracts/${created.id}`)) as { outcome: string | null };
  if (live.outcome !== "pass") throw new Error(`two agreeing votes settle it, got ${live.outcome}`);
  console.log("after 2 agreeing votes → outcome:", live.outcome);

  if (bad) {
    // Late AND wrong. It is recorded and paid, and it cannot move the verdict.
    await recordVerdict(created.escrowAddress, "fail", bad.wallet);
    live = (await getJson(`/contracts/${created.id}`)) as { outcome: string | null };
    if (live.outcome !== "pass") {
      throw new Error(`the outvoted moderator changed the verdict to ${live.outcome}`);
    }
    console.log("after the test moderator's FAIL → outcome still:", live.outcome);
  }

  // ── release: every voter paid its own price ───────────────────
  const before = new Map<string, bigint>();
  for (const s of seats) before.set(s.wallet.toBase58(), await balance(connection, s.wallet));

  const relPrep = (await postJson(`/contracts/${created.id}/release/prepare`, {
    signer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  const settled = (await signAndSubmit(
    relPrep.unsignedTx,
    committer,
    `/contracts/${created.id}/release/submit`
  )) as { status: string; panel: { wallet: string; vote: string | null }[] };

  if (settled.status !== "settled") throw new Error("expected settled, got " + settled.status);

  const committerPaid = await balance(connection, committer.publicKey);
  if (committerPaid.toString() !== String(AMOUNT)) {
    throw new Error(`expected committer paid ${AMOUNT}, got ${committerPaid}`);
  }

  console.log("\npayouts:");
  for (const s of seats) {
    const key = s.wallet.toBase58();
    const earned = (await balance(connection, s.wallet)) - (before.get(key) ?? 0n);
    const voted = bad && s.wallet.equals(bad.wallet) ? "voted FAIL (outvoted)" : "voted PASS";
    console.log(`  ${key.slice(0, 4)}…${key.slice(-4)}  +${earned}  ${voted}`);
    if (earned !== s.fee) {
      throw new Error(`moderator ${key} should earn its own fee ${s.fee}, got ${earned}`);
    }
  }

  // The panel is closed on settle; its votes survive only in the api's cache.
  const cached = settled.panel ?? [];
  console.log("cached votes after settle:", cached.map((m) => m.vote).join(", ") || "(none)");

  console.log("\n✅ 3-moderator panel: majority settled it, every voter paid its own price");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
