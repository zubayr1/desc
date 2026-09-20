import { assert } from "chai";
import {
  program,
  createEscrow,
  setupWorld,
  addModerator,
  panelPda,
  PublicKey,
  tokenBalance,
  usdc,
  BN,
} from "./helpers";

/**
 * The panel is what makes consensus possible: one account per escrow holding
 * the moderators judging it and (later) their votes. Its own file so it runs on
 * a fresh validator — each world here registers several moderators.
 */
describe("panel", () => {
  it("records one seat for a single-moderator escrow", async () => {
    const s = await createEscrow({ amount: usdc(1000) });
    const panel = await program.account.panel.fetch(s.panel);

    assert.equal(panel.count, 1);
    assert.equal(panel.quorum, 1); // its own vote decides
    assert.ok(panel.escrow.equals(s.escrow));
    assert.ok(panel.entries[0].moderator.equals(s.world.moderator.publicKey));
    assert.ok(panel.entries[0].fee.eq(usdc(10))); // 1% of 1000
    assert.equal(panel.entries[0].vote, 0); // not voted
    // The escrow points at it, and still names the single moderator.
    const esc = await program.account.escrow.fetch(s.escrow);
    assert.ok(esc.panel.equals(s.panel));
    assert.ok(esc.moderator.equals(s.world.moderator.publicKey));
  });

  it("seats three moderators, sums their prices and needs two votes", async () => {
    const world = await setupWorld(); // its moderator charges 1%
    const b = await addModerator(world, { baseBps: 50 }); // 0.5%
    const c = await addModerator(world, { baseBps: 75 }); // 0.75%
    const s = await createEscrow({
      world,
      amount: usdc(1000),
      moderators: [world.moderatorPda, b.pda, c.pda],
    });

    const panel = await program.account.panel.fetch(s.panel);
    assert.equal(panel.count, 3);
    assert.equal(panel.quorum, 2); // majority of three
    const fees = panel.entries.slice(0, 3).map((e) => e.fee.toString());
    // 7.5 USDC is not a whole token, so it is written in base units.
    assert.deepEqual(fees, [usdc(10).toString(), usdc(5).toString(), "7500000"]);

    // The deposit covers the SUM of the three: 10 + 5 + 7.5 = 22.50.
    const esc = await program.account.escrow.fetch(s.escrow);
    assert.ok(esc.moderatorSurcharge.eq(new BN(22_500_000)));
    assert.equal(esc.moderatorCount, 3);
    assert.equal(
      (await tokenBalance(s.vault)).toString(),
      usdc(1000).add(s.fee).add(new BN(22_500_000)).toString()
    );
    // With a panel there is no single moderator on the escrow — the panel is
    // the record, so the legacy field is left zeroed.
    assert.ok(esc.moderator.equals(PublicKey.default));
  });

  it("rejects an even panel — a tie has no majority", async () => {
    const world = await setupWorld();
    const b = await addModerator(world);
    try {
      await createEscrow({ world, moderators: [world.moderatorPda, b.pda] });
      assert.fail("expected InvalidPanelSize");
    } catch (e) {
      assert.include(e.toString(), "InvalidPanelSize");
    }
  });

  it("rejects the same moderator twice", async () => {
    const world = await setupWorld();
    const b = await addModerator(world);
    try {
      await createEscrow({
        world,
        moderators: [world.moderatorPda, b.pda, world.moderatorPda],
      });
      assert.fail("expected DuplicateModerator");
    } catch (e) {
      assert.include(e.toString(), "DuplicateModerator");
    }
  });

  it("gives a no-mod escrow an empty panel", async () => {
    const s = await createEscrow({ noMod: true });
    const panel = await program.account.panel.fetch(s.panel);
    assert.equal(panel.count, 0);
    assert.ok(panel.escrow.equals(s.escrow));
    const esc = await program.account.escrow.fetch(s.escrow);
    assert.ok(esc.panel.equals(panelPda(s.escrow)));
  });

  it("refuses a panel above the initiator's maximum fee", async () => {
    const world = await setupWorld();
    const b = await addModerator(world, { baseBps: 50 });
    const c = await addModerator(world, { baseBps: 75 });
    try {
      await createEscrow({
        world,
        amount: usdc(1000),
        moderators: [world.moderatorPda, b.pda, c.pda],
        maxModeratorFee: usdc(10), // quoted for one moderator, not three
      });
      assert.fail("expected ModeratorFeeAboveMax");
    } catch (e) {
      assert.include(e.toString(), "ModeratorFeeAboveMax");
    }
  });
});
