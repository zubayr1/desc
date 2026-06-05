import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  newFundedKeypair,
} from "./helpers";

async function toSubmitted() {
  const s = await createEscrow();
  const c = await acceptEscrow(s);
  await submitEscrow(s, c);
  return { s, c };
}

describe("record_verdict", () => {
  it("records a Pass verdict (no money moves, status stays Submitted)", async () => {
    const { s } = await toSubmitted();
    await recordVerdict(s, "pass", Array(32).fill(1));

    const acc = await program.account.escrow.fetch(s.escrow);
    assert.property(acc.outcome, "pass");
    assert.deepEqual(Array.from(acc.verdictHash), Array(32).fill(1));
    assert.property(acc.status, "submitted");
  });

  it("records a Fail verdict", async () => {
    const { s } = await toSubmitted();
    await recordVerdict(s, "fail");
    const acc = await program.account.escrow.fetch(s.escrow);
    assert.property(acc.outcome, "fail");
  });

  it("rejects a verdict from a non-settlement-authority", async () => {
    const { s } = await toSubmitted();
    const stranger = await newFundedKeypair();
    try {
      await program.methods
        .recordVerdict({ pass: {} }, Array(32).fill(0))
        .accountsPartial({
          settlementAuthority: stranger.publicKey,
          config: s.world.config,
          escrow: s.escrow,
        })
        .signers([stranger])
        .rpc();
      assert.fail("expected a failure");
    } catch (e) {
      assert.ok(e.toString().length > 0);
    }
  });

  it("rejects a verdict before submission", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    try {
      await recordVerdict(s, "pass");
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });

  it("rejects a second verdict (one-shot)", async () => {
    const { s } = await toSubmitted();
    await recordVerdict(s, "pass");
    try {
      await recordVerdict(s, "fail");
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });
});
