import { assert } from "chai";
import { program, createEscrow, acceptEscrow, expectError } from "./helpers";

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
    await expectError(async () => {
      await acceptEscrow(s, s.initiator);
    }, "SelfDeal");
  });

  it("rejects a second accept (first-accept-wins)", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    await expectError(async () => {
      await acceptEscrow(s);
    }, "InvalidStatus");
  });
});
