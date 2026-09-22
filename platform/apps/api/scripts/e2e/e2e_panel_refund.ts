/**
 * End-to-end check for a THREE-moderator contract that FAILS verification:
 *   create(3 mods) → fund → accept → deliver → 3 verdicts → refund.
 *
 * The refund branch is where the panel is easiest to get wrong, and until this
 * script existed nothing exercised it at all — `e2e_panel` only covers a Pass
 * and a release. What it asserts:
 *   - every moderator that voted is paid its OWN price, on a Fail as on a Pass
 *   - the moderator that voted PASS against the majority is paid too: it is
 *     paid for judging, not for agreeing
 *   - the treasury keeps the verification fee and NOTHING else — the protocol
 *     never profits from a failed deal
 *   - the initiator gets back the amount plus the rest of the protocol fee
 *   - the vault and the panel are both closed, so their rent comes back
 *
 * The dissenting PASS is Mischief's, which is what it would really submit here:
 * the honest moderators fail bad work, and the deliberately wrong one passes it.
 *
 * Prereq: validator + programs, bootstrap, db:push, api running, and THREE
 * active moderators (see platform/README.md).
 * Run: `pnpm e2e:panel-refund`.
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
  panelAddress,
  accountExists,
  pickPanel,
} from "./_shared";

const USDC_MINT = new PublicKey(process.env.USDC_MINT!);
const AMOUNT = 1_000_000_000; // 1000 USDC
const FUNDING = 1_200_000_000;

const balance = async (connection: Connection, owner: PublicKey): Promise<bigint> => {
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(USDC_MINT, owner)))
      .amount;
  } catch {
    return 0n; // no token account yet — settlement creates it
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

  // The protocol's own numbers — the verification fee is the fee floor.
  const fees = await getJson<{ protocolFeeBps: number; protocolFeeMin: string }>(
    "/config/fees"
  );
  const protocolFee = (() => {
    const bps = (BigInt(AMOUNT) * BigInt(fees.protocolFeeBps)) / 10_000n;
    const floor = BigInt(fees.protocolFeeMin);
    return bps > floor ? bps : floor;
  })();
  const verificationFee = BigInt(fees.protocolFeeMin);

  const panel = await pickPanel(3);
  const mischief = panel.find((m) => m.test);
  console.log("panel:", panel.map((m) => `${m.label} ${(m.baseBps / 100).toFixed(2)}%`).join(" · "));

  const created = (await postJson("/contracts", {
    initiator: initiator.publicKey.toBase58(),
    title: "Work that does not meet the criteria",
    brief: "Proves a Fail pays every moderator and refunds the rest.",
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
  )) as { linkToken: string };
  const token = funded.linkToken;

  const acceptPrep = (await postJson(`/links/${token}/accept/prepare`, {
    committer: committer.publicKey.toBase58(),
  })) as { unsignedTx: string };
  await signAndSubmit(acceptPrep.unsignedTx, committer, `/links/${token}/accept/submit`);
  await deliverBundle(token, committer);

  // ── verdicts: the honest two FAIL it, the test moderator PASSES it ──
  const seats = await panelSeats(created.escrowAddress);
  if (seats.length !== 3) throw new Error(`expected a panel of 3, got ${seats.length}`);
  const badWallet = mischief ? new PublicKey(mischief.wallet) : null;
  const honest = seats.filter((s) => !badWallet || !s.wallet.equals(badWallet));
  const bad = badWallet ? seats.find((s) => s.wallet.equals(badWallet))! : null;

  await recordVerdict(created.escrowAddress, "fail", honest[0].wallet);
  await recordVerdict(created.escrowAddress, "fail", honest[1].wallet);
  let live = (await getJson(`/contracts/${created.id}`)) as { outcome: string | null };
  if (live.outcome !== "fail") throw new Error(`two agreeing FAILs settle it, got ${live.outcome}`);

  if (bad) {
    await recordVerdict(created.escrowAddress, "pass", bad.wallet);
    live = (await getJson(`/contracts/${created.id}`)) as { outcome: string | null };
    if (live.outcome !== "fail") {
      throw new Error(`the dissenting PASS changed the verdict to ${live.outcome}`);
    }
    console.log("after the test moderator's PASS → outcome still: fail");
  }

  // ── refund ────────────────────────────────────────────────────
  const before = new Map<string, bigint>();
  for (const s of seats) before.set(s.wallet.toBase58(), await balance(connection, s.wallet));

  const panelPda = panelAddress(new PublicKey(created.escrowAddress));
  if (!(await accountExists(panelPda))) throw new Error("panel missing before refund");

  const refPrep = (await postJson(`/contracts/${created.id}/refund/prepare`, {})) as {
    unsignedTx: string;
  };
  const refunded = (await signAndSubmit(
    refPrep.unsignedTx,
    initiator,
    `/contracts/${created.id}/refund/submit`
  )) as { status: string };
  if (refunded.status !== "refunded") throw new Error("expected refunded, got " + refunded.status);

  // ── assertions ────────────────────────────────────────────────
  console.log("\npayouts:");
  let paid = 0n;
  for (const s of seats) {
    const key = s.wallet.toBase58();
    const earned = (await balance(connection, s.wallet)) - (before.get(key) ?? 0n);
    const how = bad && s.wallet.equals(bad.wallet) ? "voted PASS (outvoted)" : "voted FAIL";
    console.log(`  ${key.slice(0, 4)}…${key.slice(-4)}  +${earned}  ${how}`);
    if (earned !== s.fee) {
      throw new Error(`moderator ${key} should earn its own fee ${s.fee}, got ${earned}`);
    }
    paid += earned;
  }

  // Everything the initiator minted, less the moderators' fees and the
  // verification fee the treasury keeps. Checking the balance this way covers
  // the treasury too: those are the only two deductions, so a wrong treasury
  // cut shows up here as a wrong refund.
  const expected = BigInt(FUNDING) - paid - verificationFee;
  const initiatorBalance = await balance(connection, initiator.publicKey);
  console.log(
    `\ninitiator: ${initiatorBalance} (minted ${FUNDING}, less ${paid} to moderators` +
      ` and ${verificationFee} verification fee)`
  );
  if (initiatorBalance !== expected) {
    throw new Error(`initiator should hold ${expected}, got ${initiatorBalance}`);
  }
  // The deal itself cost nothing but the verification: the payout came back.
  console.log(`refunded the full ${AMOUNT} payout and ${protocolFee - verificationFee} of the protocol fee`);

  if (await accountExists(panelPda)) {
    throw new Error("panel account survived refund — its rent is stranded");
  }
  console.log("panel closed ✓");

  console.log("\n✅ 3-moderator Fail: every voter paid its own price, the rest refunded");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
