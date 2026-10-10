import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  commitVote,
  revealVote,
  setupWorld,
  addModerator,
  usdc,
  expectError,
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
  it("settles on the second agreeing reveal, without waiting for the third", async () => {
    const { s, mods } = await panelOfThree();
    await commitVote(s, "pass", Array(32).fill(1), mods[0]);
    await commitVote(s, "pass", Array(32).fill(2), mods[1]);
    await commitVote(s, "pass", Array(32).fill(3), mods[2]);

    await revealVote(s, mods[0]);
    let esc = await program.account.escrow.fetch(s.escrow);
    assert.isNull(esc.outcome, "one vote is not a majority of three");

    await revealVote(s, mods[1]);
    esc = await program.account.escrow.fetch(s.escrow);
    assert.property(esc.outcome, "pass");
    assert.deepEqual(Array.from(esc.verdictHash), Array(32).fill(2));

    const panel = await program.account.panel.fetch(s.panel);
    assert.deepEqual(
      panel.entries.slice(0, 3).map((e) => e.vote),
      [1, 1, 3] // pass, pass, committed and not yet revealed
    );
  });

  it("lets the third reveal break a 1-1 split", async () => {
    const { s, mods } = await panelOfThree();
    await commitVote(s, "pass", Array(32).fill(1), mods[0]);
    await commitVote(s, "fail", Array(32).fill(2), mods[1]);
    await commitVote(s, "fail", Array(32).fill(3), mods[2]);

    await revealVote(s, mods[0]);
    await revealVote(s, mods[1]);
    assert.isNull((await program.account.escrow.fetch(s.escrow)).outcome);

    await revealVote(s, mods[2]);
    assert.property((await program.account.escrow.fetch(s.escrow)).outcome, "fail");
    const panel = await program.account.panel.fetch(s.panel);
    assert.deepEqual(panel.entries.slice(0, 3).map((e) => e.vote), [1, 2, 2]);
  });

  it("records a late reveal without letting it change the outcome", async () => {
    const { s, mods } = await panelOfThree();
    await commitVote(s, "pass", Array(32).fill(1), mods[0]);
    await commitVote(s, "pass", Array(32).fill(2), mods[1]);
    await commitVote(s, "fail", Array(32).fill(3), mods[2]);
    await revealVote(s, mods[0]);
    await revealVote(s, mods[1]);
    await revealVote(s, mods[2]);

    const esc = await program.account.escrow.fetch(s.escrow);
    assert.property(esc.outcome, "pass");
    assert.deepEqual(Array.from(esc.verdictHash), Array(32).fill(2), "the deciding vote's hash stands");
    const panel = await program.account.panel.fetch(s.panel);
    assert.deepEqual(panel.entries.slice(0, 3).map((e) => e.vote), [1, 1, 2]);
  });

  it("rejects a second commit from the same moderator", async () => {
    const { s, mods } = await panelOfThree();
    await commitVote(s, "pass", Array(32).fill(1), mods[0]);
    await expectError(async () => {
      await commitVote(s, "fail", Array(32).fill(9), mods[0]);
    }, "AlreadyVoted");
  });

  it("rejects a registered moderator that is not on this panel", async () => {
    const world = await setupWorld();
    const b = await addModerator(world);
    const c = await addModerator(world);
    const outsider = await addModerator(world);
    const s = await createEscrow({ world, moderators: [world.moderatorPda, b.pda, c.pda] });
    const committer = await acceptEscrow(s);
    await submitEscrow(s, committer);
    await expectError(async () => {
      await commitVote(s, "pass", Array(32).fill(1), outsider.wallet);
    }, "NotAssignedModerator");
  });

  it("still settles a single-moderator escrow on one direct vote", async () => {
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
