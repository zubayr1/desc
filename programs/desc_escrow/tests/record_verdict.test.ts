import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  newFundedKeypair,
  addModerator,
  expectError,
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
    // The assigned moderator (bound at creation) is who the surcharge is paid
    // to, on a Fail as well as a Pass.
    assert.ok(acc.moderator.equals(s.world.moderator.publicKey));
  });

  it("rejects a verdict from a non-settlement-authority", async () => {
    const { s } = await toSubmitted();
    const stranger = await newFundedKeypair();
    await expectError(async () => {
      await program.methods
        .recordVerdict({ pass: {} }, Array(32).fill(0), stranger.publicKey)
        .accountsPartial({
          settlementAuthority: stranger.publicKey,
          config: s.world.config,
          escrow: s.escrow,
        })
        .signers([stranger])
        .rpc();
    });
  });

  it("rejects a verdict before submission", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    await expectError(async () => {
      await recordVerdict(s, "pass");
    }, "InvalidStatus");
  });

  it("rejects a second verdict (one-shot)", async () => {
    const { s } = await toSubmitted();
    await recordVerdict(s, "pass");
    // One vote per SEAT. A decided escrow no longer rejects further votes —
    // late ones from other moderators are recorded, paid and scored — so what
    // stops this is the moderator having already used its own seat.
    await expectError(async () => {
      await recordVerdict(s, "fail");
    }, "AlreadyVoted");
  });

  it("rejects a verdict from a registered moderator that was not assigned", async () => {
    const { s } = await toSubmitted();
    const other = await addModerator(s.world); // real, active, same platform
    await expectError(async () => {
      await recordVerdict(s, "pass", Array(32).fill(3), other.wallet);
    }, "NotAssignedModerator");
  });
});
