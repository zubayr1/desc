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
      .updateConfig(null, null, null, true)
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
