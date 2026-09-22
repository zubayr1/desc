import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  setupWorld,
  addModerator,
  releaseEscrow,
  refundEscrow,
  fundedAta,
  tokenBalance,
  accountExists,
  usdc,
  BN,
  Keypair,
  PublicKey,
  TOKEN_PROGRAM_ID,
} from "./helpers";

/**
 * Settlement with a panel: who gets paid, how much, and what happens to the
 * fees of a moderator that never voted.
 *
 * The rule under test (see feature-doc.md, V2 / consensus): the first majority decides, and
 * EVERY moderator that voted is paid its own price — the outvoted one and the
 * one whose vote landed after the majority included. Fees of moderators that
 * never voted go back to the initiator.
 */

interface Seat {
  wallet: Keypair;
  pda: PublicKey;
  ata: PublicKey;
  bps: number;
  fee: BN;
}

/** A submitted escrow with three moderators, each on its own price. */
async function panelOfThree(bps = [100, 50, 75], amount = usdc(1000)) {
  const world = await setupWorld(200, 0, 0, bps[0]);
  const extra = [
    await addModerator(world, { baseBps: bps[1] }),
    await addModerator(world, { baseBps: bps[2] }),
  ];

  const seats: Seat[] = [];
  const members = [
    { wallet: world.moderator, pda: world.moderatorPda },
    ...extra,
  ];
  for (let i = 0; i < members.length; i++) {
    seats.push({
      wallet: members[i].wallet,
      pda: members[i].pda,
      ata: await fundedAta(
        world.mintAuthority,
        world.mint,
        members[i].wallet.publicKey,
        0,
        world.mintAuthority
      ),
      bps: bps[i],
      fee: amount.mul(new BN(bps[i])).div(new BN(10_000)),
    });
  }

  const s = await createEscrow({
    world,
    amount,
    moderators: seats.map((x) => x.pda),
    moderatorBps: bps,
  });
  const committer = await acceptEscrow(s);
  const committerAta = await fundedAta(
    world.mintAuthority,
    world.mint,
    committer.publicKey,
    0,
    world.mintAuthority
  );
  await submitEscrow(s, committer);
  return { s, committer, committerAta, seats };
}

describe("panel payout", () => {
  it("pays every moderator its own price on a Pass", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();

    // The deposit is the SUM of the three prices, not one fee split three ways.
    assert.equal(
      s.surcharge.toString(),
      seats.reduce((sum, x) => sum.add(x.fee), new BN(0)).toString()
    );

    for (const seat of seats) {
      await recordVerdict(s, "pass", Array(32).fill(1), seat.wallet);
    }
    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });

    assert.equal((await tokenBalance(committerAta)).toString(), s.amount.toString());
    assert.equal((await tokenBalance(s.world.treasury)).toString(), s.fee.toString());
    for (const seat of seats) {
      assert.equal(
        (await tokenBalance(seat.ata)).toString(),
        seat.fee.toString(),
        `moderator at ${seat.bps}bps paid its own price`
      );
    }
    // Everyone voted, so nothing comes back to the initiator.
    assert.equal((await tokenBalance(s.initiatorAta)).toString(), "0");
    assert.isFalse(await accountExists(s.vault));
    assert.isFalse(await accountExists(s.panel), "panel closed on release");
  });

  it("pays the outvoted moderator too, on a Fail", async () => {
    const { s, seats } = await panelOfThree();

    // 1-1, then the third vote decides Fail — seat 0 is on the losing side.
    await recordVerdict(s, "pass", Array(32).fill(1), seats[0].wallet);
    await recordVerdict(s, "fail", Array(32).fill(2), seats[1].wallet);
    await recordVerdict(s, "fail", Array(32).fill(3), seats[2].wallet);
    assert.property((await program.account.escrow.fetch(s.escrow)).outcome, "fail");

    await refundEscrow(s);

    // Being wrong is not the same as doing nothing: it judged, so it is paid.
    assert.equal(
      (await tokenBalance(seats[0].ata)).toString(),
      seats[0].fee.toString(),
      "outvoted moderator still earns its fee"
    );
    for (const seat of seats.slice(1)) {
      assert.equal((await tokenBalance(seat.ata)).toString(), seat.fee.toString());
    }
    // No fee floor configured -> no verification fee -> everything else back.
    assert.equal(
      (await tokenBalance(s.initiatorAta)).toString(),
      s.amount.add(s.fee).toString()
    );
    assert.equal((await tokenBalance(s.world.treasury)).toString(), "0");
    assert.isFalse(await accountExists(s.panel), "panel closed on refund");
  });

  it("pays a moderator whose vote landed after the majority", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();

    await recordVerdict(s, "pass", Array(32).fill(1), seats[0].wallet);
    await recordVerdict(s, "pass", Array(32).fill(2), seats[1].wallet);
    // Already decided — this one was still judging when the majority formed.
    await recordVerdict(s, "fail", Array(32).fill(3), seats[2].wallet);

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });

    assert.equal(
      (await tokenBalance(seats[2].ata)).toString(),
      seats[2].fee.toString(),
      "late dissent is paid — it did the same work"
    );
    assert.equal((await tokenBalance(s.initiatorAta)).toString(), "0");
  });

  it("returns a silent moderator's fee to the initiator", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();

    // Two agree and settle it; the third never votes at all.
    await recordVerdict(s, "pass", Array(32).fill(1), seats[0].wallet);
    await recordVerdict(s, "pass", Array(32).fill(2), seats[1].wallet);

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });

    assert.equal((await tokenBalance(seats[0].ata)).toString(), seats[0].fee.toString());
    assert.equal((await tokenBalance(seats[1].ata)).toString(), seats[1].fee.toString());
    assert.equal((await tokenBalance(seats[2].ata)).toString(), "0", "silent mod unpaid");
    // Its fee was locked by the initiator and comes straight back.
    assert.equal(
      (await tokenBalance(s.initiatorAta)).toString(),
      seats[2].fee.toString()
    );
    assert.isFalse(await accountExists(s.vault), "vault fully drained");
  });

  it("rejects a payout routed to the wrong moderator", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();
    await recordVerdict(s, "pass", Array(32).fill(1), seats[0].wallet);
    await recordVerdict(s, "pass", Array(32).fill(2), seats[1].wallet);

    // Seat 1's fee aimed at seat 0's wallet — the program checks each account
    // against its own panel entry, so this cannot be used to skim a fee.
    try {
      await releaseEscrow(s, {
        signer: committer,
        committerTokenAccount: committerAta,
        moderatorAtas: [seats[0].ata, seats[0].ata, seats[2].ata],
      });
      assert.fail("expected Unauthorized");
    } catch (e) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  it("rejects a release that does not carry one account per seat", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();
    await recordVerdict(s, "pass", Array(32).fill(1), seats[0].wallet);
    await recordVerdict(s, "pass", Array(32).fill(2), seats[1].wallet);

    // Two accounts for a panel of three: the count is per SEAT, not per voter,
    // so passing only the voters is rejected rather than silently mis-paid.
    try {
      await releaseEscrow(s, {
        signer: committer,
        committerTokenAccount: committerAta,
        moderatorAtas: [seats[0].ata, seats[1].ata],
      });
      assert.fail("expected ModeratorConfigMismatch");
    } catch (e) {
      assert.include(e.toString(), "ModeratorConfigMismatch");
    }
  });

  it("settles from a transaction built before the last vote landed", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();
    await recordVerdict(s, "pass", Array(32).fill(1), seats[0].wallet);
    await recordVerdict(s, "pass", Array(32).fill(2), seats[1].wallet);

    // The accounts are chosen while only two seats have voted — the shape a
    // wallet would be handed the moment the Release button appears. The third
    // vote then lands before the transaction does. One account per seat means
    // the list is already right; one per voter would have been one short.
    const atas = seats.map((x) => x.ata);
    await recordVerdict(s, "pass", Array(32).fill(3), seats[2].wallet);

    await releaseEscrow(s, {
      signer: committer,
      committerTokenAccount: committerAta,
      moderatorAtas: atas,
    });

    for (const seat of seats) {
      assert.equal((await tokenBalance(seat.ata)).toString(), seat.fee.toString());
    }
  });

  it("closes the panel when the escrow is cancelled", async () => {
    const s = await createEscrow();
    assert.isTrue(await accountExists(s.panel));

    await program.methods
      .cancel()
      .accountsPartial({
        initiator: s.initiator.publicKey,
        escrow: s.escrow,
        panel: s.panel,
        vault: s.vault,
        initiatorTokenAccount: s.initiatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([s.initiator])
      .rpc();

    // Rent the initiator put up at creation comes back with the deposit.
    assert.isFalse(await accountExists(s.panel), "panel closed on cancel");
    assert.isFalse(await accountExists(s.vault));
  });
});
