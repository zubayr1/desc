import { assert } from "chai";
import { program, createEscrow, acceptEscrow } from "./helpers";

describe("accept", () => {
  it("binds the committer and goes Active", async () => {
    const s = await createEscrow();
    const c = await acceptEscrow(s);
    const acc = await program.account.escrow.fetch(s.escrow);
    assert.property(acc.status, "active");
    assert.ok(acc.committer.equals(c.publicKey));
  });

  it("rejects self-dealing (initiator accepting own escrow)", async () => {
    const s = await createEscrow();
    try {
      await acceptEscrow(s, s.initiator);
      assert.fail("expected SelfDeal");
    } catch (e) {
      assert.include(e.toString(), "SelfDeal");
    }
  });

  it("rejects a second accept (first-accept-wins)", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    try {
      await acceptEscrow(s);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });
});
