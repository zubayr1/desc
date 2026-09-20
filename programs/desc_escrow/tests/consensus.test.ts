import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  setupWorld,
  addModerator,
  usdc,
} from "./helpers";

/** A submitted 3-moderator escrow, ready to be voted on. */
async function panelOfThree() {
  const world = await setupWorld();
  const b = await addModerator(world);
  const c = await addModerator(world);
  const s = await createEscrow({
    world,
    amount: usdc(1000),
    moderators: [world.moderatorPda, b.pda, c.pda],
  });
  const committer = await acceptEscrow(s);
  await submitEscrow(s, committer);
  return { s, committer, mods: [world.moderator, b.wallet, c.wallet] };
}

describe("consensus", () => {
  it("settles on the second agreeing vote, without waiting for the third", async () => {
    const { s, mods } = await panelOfThree();

    await recordVerdict(s, "pass", Array(32).fill(1), mods[0]);
    let esc = await program.account.escrow.fetch(s.escrow);
    assert.isNull(esc.outcome, "one vote is not a majority of three");

    await recordVerdict(s, "pass", Array(32).fill(2), mods[1]);
    esc = await program.account.escrow.fetch(s.escrow);
    assert.property(esc.outcome, "pass");
    // The deciding vote's hash is what the escrow records.
    assert.deepEqual(Array.from(esc.verdictHash), Array(32).fill(2));

    const panel = await program.account.panel.fetch(s.panel);
    assert.deepEqual(
      panel.entries.slice(0, 3).map((e) => e.vote),
      [1, 1, 0] // pass, pass, never voted
    );
  });

  it("lets the third vote break a 1-1 split", async () => {
    const { s, mods } = await panelOfThree();

    await recordVerdict(s, "pass", Array(32).fill(1), mods[0]);
    await recordVerdict(s, "fail", Array(32).fill(2), mods[1]);
    let esc = await program.account.escrow.fetch(s.escrow);
    assert.isNull(esc.outcome, "a 1-1 split has no majority");

    // The outvoted moderator's vote stays on the panel — it did the work.
    await recordVerdict(s, "fail", Array(32).fill(3), mods[2]);
    esc = await program.account.escrow.fetch(s.escrow);
    assert.property(esc.outcome, "fail");

    const panel = await program.account.panel.fetch(s.panel);
    assert.deepEqual(
      panel.entries.slice(0, 3).map((e) => e.vote),
      [1, 2, 2] // pass, fail, fail
    );
  });

  it("records a late vote without letting it change the outcome", async () => {
    const { s, mods } = await panelOfThree();
    await recordVerdict(s, "pass", Array(32).fill(1), mods[0]);
    await recordVerdict(s, "pass", Array(32).fill(2), mods[1]);

    // The third moderator was already judging when the majority formed. Its
    // vote is kept — it did the same work, and it is paid on settle — but it
    // cannot move a verdict that is already final.
    await recordVerdict(s, "fail", Array(32).fill(3), mods[2]);

    const esc = await program.account.escrow.fetch(s.escrow);
    assert.property(esc.outcome, "pass");
    assert.deepEqual(
      Array.from(esc.verdictHash),
      Array(32).fill(2),
      "the deciding vote's hash stands"
    );

    const panel = await program.account.panel.fetch(s.panel);
    assert.deepEqual(
      panel.entries.slice(0, 3).map((e) => e.vote),
      [1, 1, 2] // pass, pass, and the late dissent on record
    );
  });

  it("rejects a second vote from the same moderator", async () => {
    const { s, mods } = await panelOfThree();
    await recordVerdict(s, "pass", Array(32).fill(1), mods[0]);
    try {
      await recordVerdict(s, "fail", Array(32).fill(9), mods[0]);
      assert.fail("expected AlreadyVoted");
    } catch (e) {
      assert.include(e.toString(), "AlreadyVoted");
    }
  });

  it("rejects a registered moderator that is not on this panel", async () => {
    const world = await setupWorld();
    const b = await addModerator(world);
    const c = await addModerator(world);
    const outsider = await addModerator(world); // real, active, not seated
    const s = await createEscrow({
      world,
      moderators: [world.moderatorPda, b.pda, c.pda],
    });
    const committer = await acceptEscrow(s);
    await submitEscrow(s, committer);
    try {
      await recordVerdict(s, "pass", Array(32).fill(1), outsider.wallet);
      assert.fail("expected NotAssignedModerator");
    } catch (e) {
      assert.include(e.toString(), "NotAssignedModerator");
    }
  });

  it("still settles a single-moderator escrow on one vote", async () => {
    const s = await createEscrow();
    const committer = await acceptEscrow(s);
    await submitEscrow(s, committer);
    await recordVerdict(s, "pass");
    const esc = await program.account.escrow.fetch(s.escrow);
    assert.property(esc.outcome, "pass");
    const panel = await program.account.panel.fetch(s.panel);
    assert.equal(panel.quorum, 1);
    assert.equal(panel.entries[0].vote, 1);
  });
});
