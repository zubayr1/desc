import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  setupWorld,
  tokenBalance,
  accountExists,
  chainUnixTs,
  waitForChainTime,
  usdc,
  TOKEN_PROGRAM_ID,
} from "./helpers";

/** `moderator: false` models the ghost-timeout path, where no verdict was
 *  rendered and the optional moderator account is omitted. */
async function refund(s: any, moderator = true) {
  await program.methods
    .refund()
    .accountsPartial({
      initiator: s.initiator.publicKey,
      escrow: s.escrow,
      config: s.world.config,
      vault: s.vault,
      initiatorTokenAccount: s.initiatorAta,
      treasury: s.world.treasury,
      moderatorTokenAccount: moderator ? s.world.moderatorAta : null,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([s.initiator])
    .rpc();
}

async function failedEscrow(world?: any, amount?: any) {
  const s = await createEscrow(world ? { world, amount } : { amount });
  const c = await acceptEscrow(s);
  await submitEscrow(s, c);
  await recordVerdict(s, "fail");
  return s;
}

describe("refund", () => {
  it("pays the moderator its surcharge on a Fail and returns the rest", async () => {
    // No fee floor configured -> no verification fee -> the whole protocol fee
    // comes back to the initiator (the old fee-on-Pass-only behaviour).
    const s = await failedEscrow();
    const total = s.amount.add(s.fee).add(s.surcharge);

    await refund(s);

    assert.equal(
      (await tokenBalance(s.initiatorAta)).toString(),
      total.sub(s.surcharge).toString()
    );
    assert.equal(
      (await tokenBalance(s.world.moderatorAta)).toString(),
      s.surcharge.toString()
    );
    assert.equal((await tokenBalance(s.world.treasury)).toString(), "0");
    assert.isFalse(await accountExists(s.vault));
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");
  });

  it("keeps only the verification fee on a Fail when a floor is configured", async () => {
    const world = await setupWorld(200, usdc(1).toNumber()); // $1 floor
    const s = await failedEscrow(world); // 1000 USDC -> 2% fee = 20 USDC
    const total = s.amount.add(s.fee).add(s.surcharge);
    const verificationFee = usdc(1);

    await refund(s);

    // The protocol recovers its verification cost and nothing more; the rest of
    // the fee goes back, so a failed deal is never a profit centre.
    assert.equal(
      (await tokenBalance(world.treasury)).toString(),
      verificationFee.toString()
    );
    assert.equal(
      (await tokenBalance(s.initiatorAta)).toString(),
      total.sub(s.surcharge).sub(verificationFee).toString()
    );
    assert.equal(
      (await tokenBalance(world.moderatorAta)).toString(),
      s.surcharge.toString()
    );
    // Vault fully drained and closed — the three payouts account for every unit.
    assert.isFalse(await accountExists(s.vault));
  });

  it("keeps the whole fee when the floor is the fee (tiny contract)", async () => {
    const world = await setupWorld(200, usdc(1).toNumber());
    // 10 USDC at 2% = 0.2 USDC, below the floor -> fee == floor == 1 USDC, and
    // the entire fee is the verification fee.
    const s = await failedEscrow(world, usdc(10));
    assert.equal(s.fee.toString(), usdc(1).toString());

    await refund(s);

    assert.equal((await tokenBalance(world.treasury)).toString(), s.fee.toString());
    assert.equal(
      (await tokenBalance(s.initiatorAta)).toString(),
      s.amount.toString() // fee and surcharge both earned, payout returned
    );
  });

  it("charges nothing on a ghost-timeout, even with a floor configured", async () => {
    const world = await setupWorld(200, usdc(1).toNumber());
    // Deadlines are compared against the VALIDATOR's clock, which drifts from
    // wall time — so pin it in chain time and wait for the chain, not the wall.
    const deadline = (await chainUnixTs()) + 5;
    const s = await createEscrow({ world, deadlineAbsolute: deadline });
    const total = s.amount.add(s.fee).add(s.surcharge);
    await acceptEscrow(s);
    await waitForChainTime(deadline);

    await refund(s, false);

    // No moderator did any work, so the initiator is made whole.
    assert.equal((await tokenBalance(s.initiatorAta)).toString(), total.toString());
    assert.equal((await tokenBalance(world.treasury)).toString(), "0");
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");
  });

  it("rejects refund while Active before the deadline", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    try {
      await refund(s, false);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });

  it("rejects refund when the verdict is Pass", async () => {
    const s = await createEscrow();
    const c = await acceptEscrow(s);
    await submitEscrow(s, c);
    await recordVerdict(s, "pass");
    try {
      await refund(s);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });
});
