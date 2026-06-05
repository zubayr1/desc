import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  newFundedKeypair,
  sleep,
} from "./helpers";

describe("submit", () => {
  it("records the deliverable and freezes (Submitted)", async () => {
    const s = await createEscrow();
    const c = await acceptEscrow(s);
    await submitEscrow(s, c, Array(32).fill(5));

    const acc = await program.account.escrow.fetch(s.escrow);
    assert.property(acc.status, "submitted");
    assert.isNotNull(acc.submittedAt);
    assert.deepEqual(Array.from(acc.deliverableHash), Array(32).fill(5));
  });

  it("rejects submit from a non-committer", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    const stranger = await newFundedKeypair();
    try {
      await submitEscrow(s, stranger);
      assert.fail("expected Unauthorized");
    } catch (e) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  it("rejects submit before acceptance", async () => {
    const s = await createEscrow();
    const c = await newFundedKeypair();
    try {
      await submitEscrow(s, c);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });

  it("rejects submit after the deadline", async () => {
    const s = await createEscrow({ deadlineOffset: 3 });
    const c = await acceptEscrow(s);
    await sleep(5000);
    try {
      await submitEscrow(s, c);
      assert.fail("expected DeadlinePassed");
    } catch (e) {
      assert.include(e.toString(), "DeadlinePassed");
    }
  });
});
