import { assert } from "chai";
import { program, createEscrow, setupWorld, tokenBalance, usdc, BN } from "./helpers";

describe("create_escrow", () => {
  it("funds the vault and initializes escrow state", async () => {
    const amount = usdc(1000);
    const surcharge = usdc(30);
    const s = await createEscrow({ amount, surcharge });
    const total = amount.add(s.fee).add(surcharge);

    assert.equal((await tokenBalance(s.vault)).toString(), total.toString());

    const acc = await program.account.escrow.fetch(s.escrow);
    assert.equal(acc.version, 1);
    assert.property(acc.status, "funded");
    assert.isNull(acc.committer);
    assert.ok(acc.amount.eq(amount));
    assert.ok(acc.protocolFee.eq(s.fee)); // 2% snapshot
    assert.ok(acc.moderatorSurcharge.eq(surcharge));
    assert.equal(acc.moderatorCount, 3);
    assert.ok(acc.config.equals(s.world.config));
    assert.isNull(acc.outcome);
  });

  it("applies the fee floor when the bps fee is below it", async () => {
    const world = await setupWorld(200, usdc(1).toNumber()); // $1 floor
    // 10 USDC at 2% = 0.2 USDC -> floored to 1 USDC.
    const s = await createEscrow({ world, amount: usdc(10), surcharge: usdc(0) });

    const acc = await program.account.escrow.fetch(s.escrow);
    assert.ok(acc.protocolFee.eq(usdc(1)));
    assert.ok(acc.verificationFee.eq(usdc(1)));
    assert.equal(
      (await tokenBalance(s.vault)).toString(),
      usdc(10).add(usdc(1)).toString()
    );
  });

  it("uses the bps fee when it exceeds the floor", async () => {
    const world = await setupWorld(200, usdc(1).toNumber());
    // 1000 USDC at 2% = 20 USDC, well above the floor.
    const s = await createEscrow({ world, amount: usdc(1000), surcharge: usdc(0) });

    const acc = await program.account.escrow.fetch(s.escrow);
    assert.ok(acc.protocolFee.eq(usdc(20)));
    // Only the floor is non-refundable; the other 19 USDC returns on a Fail.
    assert.ok(acc.verificationFee.eq(usdc(1)));
  });

  it("charges no floor and no verification fee when none is configured", async () => {
    const s = await createEscrow({ amount: usdc(10), surcharge: usdc(0) });
    const acc = await program.account.escrow.fetch(s.escrow);
    assert.ok(acc.protocolFee.eq(usdc(10).mul(new BN(200)).div(new BN(10_000))));
    assert.ok(acc.verificationFee.eq(new BN(0)));
  });

  it("rejects an amount below the configured minimum", async () => {
    const world = await setupWorld(200, usdc(1).toNumber(), usdc(50).toNumber());
    try {
      await createEscrow({ world, amount: usdc(49) });
      assert.fail("expected AmountBelowMinimum");
    } catch (e) {
      assert.include(e.toString(), "AmountBelowMinimum");
    }
  });

  it("accepts an amount exactly at the minimum", async () => {
    const world = await setupWorld(200, usdc(1).toNumber(), usdc(50).toNumber());
    const s = await createEscrow({ world, amount: usdc(50), surcharge: usdc(0) });
    const acc = await program.account.escrow.fetch(s.escrow);
    assert.ok(acc.amount.eq(usdc(50)));
    // $50 at 2% is exactly the $1 floor — the crossover point.
    assert.ok(acc.protocolFee.eq(usdc(1)));
  });

  it("rejects a zero amount", async () => {
    try {
      await createEscrow({ amount: new BN(0) });
      assert.fail("expected InvalidAmount");
    } catch (e) {
      assert.include(e.toString(), "InvalidAmount");
    }
  });

  it("rejects a deadline in the past", async () => {
    try {
      await createEscrow({ deadlineOffset: -10 });
      assert.fail("expected InvalidDeadline");
    } catch (e) {
      assert.include(e.toString(), "InvalidDeadline");
    }
  });

  it("rejects when the protocol is paused", async () => {
    const world = await setupWorld();
    await program.methods
      .updateConfig(null, null, null, null, null, true)
      .accountsPartial({ authority: world.authority.publicKey, config: world.config })
      .signers([world.authority])
      .rpc();

    try {
      await createEscrow({ world });
      assert.fail("expected ProtocolPaused");
    } catch (e) {
      assert.include(e.toString(), "ProtocolPaused");
    }
  });
});
