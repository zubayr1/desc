import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  newFundedKeypair,
  chainUnixTs,
  waitForChainTime,
  setupWorld,
  expectError,
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
    await expectError(async () => {
      await submitEscrow(s, stranger);
    }, "Unauthorized");
  });

  it("rejects submit before acceptance", async () => {
    const s = await createEscrow();
    const c = await newFundedKeypair();
    await expectError(async () => {
      await submitEscrow(s, c);
    }, "InvalidStatus");
  });

  it("rejects submit after the deadline", async () => {
    // Deadlines are compared against the VALIDATOR's clock, which drifts from
    // wall time — pin it in chain time and wait for the chain, not the wall.
    // Build the world BEFORE pinning the deadline: setting one up now also
    // creates a moderation config and registers a moderator, which can outlast
    // a 5s window and make the escrow itself fail creation.
    const world = await setupWorld();
    const deadline = (await chainUnixTs()) + 5;
    const s = await createEscrow({ world, deadlineAbsolute: deadline });
    const c = await acceptEscrow(s);
    await waitForChainTime(deadline);
    await expectError(async () => {
      await submitEscrow(s, c);
    }, "DeadlinePassed");
  });
});
