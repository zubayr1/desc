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
  usdc,
  refundEscrow,
  expectError,
} from "./helpers";

/** Moderator token accounts default to whoever voted — none before a verdict,
 *  which is also the ghost-timeout shape. */
async function refund(s: any) {
  await refundEscrow(s);
}

async function failedEscrow(world?: any, amount?: any) {
  const s = await createEscrow(world ? { world, amount } : { amount });
  const c = await acceptEscrow(s);
  await submitEscrow(s, c);
  await recordVerdict(s, "fail");
  return s;
}

describe("refund", () => {
  it("pays the moderator its surcharge on a Fail and returns the payout", async () => {
    const s = await failedEscrow();

    await refund(s);

    assert.equal((await tokenBalance(s.initiatorAta)).toString(), s.amount.toString());
    assert.equal(
      (await tokenBalance(s.world.moderatorAta)).toString(),
      s.surcharge.toString()
    );
    assert.equal((await tokenBalance(s.world.treasury)).toString(), s.fee.toString());
    assert.isFalse(await accountExists(s.vault));
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");
  });

  it("keeps the same protocol fee on a Fail as on a Pass", async () => {
    const world = await setupWorld(200, usdc(1).toNumber()); // $1 floor
    const s = await failedEscrow(world); // 1000 USDC -> 2% fee = 20 USDC
    assert.equal(s.fee.toString(), usdc(20).toString());

    await refund(s);

    // The protocol earns the same whichever way the verdict goes.
    assert.equal((await tokenBalance(world.treasury)).toString(), s.fee.toString());
    assert.equal((await tokenBalance(s.initiatorAta)).toString(), s.amount.toString());
    assert.equal(
      (await tokenBalance(world.moderatorAta)).toString(),
      s.surcharge.toString()
    );
    // Vault fully drained and closed — the three payouts account for every unit.
    assert.isFalse(await accountExists(s.vault));
  });

  it("keeps the whole fee when the floor is the fee (tiny contract)", async () => {
    const world = await setupWorld(200, usdc(1).toNumber());
    // 10 USDC at 2% = 0.2 USDC, below the floor -> fee == floor == 1 USDC.
    const s = await failedEscrow(world, usdc(10));
    assert.equal(s.fee.toString(), usdc(1).toString());

    await refund(s);

    assert.equal((await tokenBalance(world.treasury)).toString(), s.fee.toString());
    assert.equal(
      (await tokenBalance(s.initiatorAta)).toString(),
      s.amount.toString() // fee and surcharge both earned, payout returned
    );
  });

  it("rejects refund while Active before the deadline", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    await expectError(async () => {
      await refund(s);
    }, "InvalidStatus");
  });

  it("rejects refund when the verdict is Pass", async () => {
    const s = await createEscrow();
    const c = await acceptEscrow(s);
    await submitEscrow(s, c);
    await recordVerdict(s, "pass");
    await expectError(async () => {
      await refund(s);
    }, "InvalidStatus");
  });
});
