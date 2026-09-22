import { assert } from "chai";
import {
  program,
  moderation,
  createEscrow,
  setupWorld,
  addModerator,
  usdc,
  BN,
} from "./helpers";

// Its own file so it runs on a fresh validator (see run-tests.sh): each world
// here also stands up a moderation config and registered moderators, and piled
// onto create_escrow.test.ts that pushed the validator into dropped blockhashes.
describe("moderator pricing", () => {
  // The moderator's fee is the MODERATOR's price, read from its account.
  // It used to be an instruction argument: a caller could pass 0 and the
  // moderator judged for free. There is no fee argument left to lie about.

  it("charges the assigned moderator's own price and snapshots it", async () => {
    const world = await setupWorld(200, 0, 0, 250); // this moderator asks 2.5%
    const s = await createEscrow({ world, amount: usdc(1000) });
    const acc = await program.account.escrow.fetch(s.escrow);
    assert.ok(acc.moderatorSurcharge.eq(usdc(25)));
    assert.equal(acc.baseBps, 250);
    assert.ok(acc.feePerKb.eq(new BN(0)));
    assert.equal(acc.maxBundleKb, 0);

    // A later price change does not reach a deal already struck.
    await moderation.methods
      .updateModeratorPricing(500, new BN(0), 0)
      .accountsPartial({ authority: world.moderator.publicKey, moderator: world.moderatorPda })
      .signers([world.moderator])
      .rpc();
    const after = await program.account.escrow.fetch(s.escrow);
    assert.ok(after.moderatorSurcharge.eq(usdc(25)));
    assert.equal(after.baseBps, 250);
  });

  it("rejects a size-priced moderator until size pricing ships", async () => {
    const world = await setupWorld();
    const sized = await addModerator(world, { feePerKb: 1_000, maxBundleKb: 500 });
    try {
      await createEscrow({ world, moderators: [sized.pda] });
      assert.fail("expected SizePricingNotEnabled");
    } catch (e) {
      assert.include(e.toString(), "SizePricingNotEnabled");
    }
  });

  it("rejects a paused moderator", async () => {
    const world = await setupWorld();
    await moderation.methods
      .setModeratorActive(false)
      .accountsPartial({ authority: world.moderator.publicKey, moderator: world.moderatorPda })
      .signers([world.moderator])
      .rpc();
    try {
      await createEscrow({ world });
      assert.fail("expected ModeratorInactive");
    } catch (e) {
      assert.include(e.toString(), "ModeratorInactive");
    }
  });

  it("rejects a moderator registered with a different settlement authority", async () => {
    const ours = await setupWorld();
    const theirs = await setupWorld(); // a genuine Moderator, wrong platform
    try {
      await createEscrow({ world: ours, moderators: [theirs.moderatorPda] });
      assert.fail("expected ModeratorNotRecognized");
    } catch (e) {
      assert.include(e.toString(), "ModeratorNotRecognized");
    }
  });

  it("rejects an account that is not a moderator at all", async () => {
    const world = await setupWorld();
    try {
      // The escrow Config: a real account, wrong discriminator.
      await createEscrow({ world, moderators: [world.config] });
      assert.fail("expected ModeratorNotRecognized");
    } catch (e) {
      assert.include(e.toString(), "ModeratorNotRecognized");
    }
  });

  // --- Slippage guard: the initiator agreed to a price; a rise since fails ---

  it("rejects when the moderator raised its price after the quote", async () => {
    const world = await setupWorld(); // quoted at 1%
    const quoted = usdc(10); // 1% of 1000 — what the initiator saw
    await moderation.methods
      .updateModeratorPricing(200, new BN(0), 0) // now 2%
      .accountsPartial({ authority: world.moderator.publicKey, moderator: world.moderatorPda })
      .signers([world.moderator])
      .rpc();
    try {
      await createEscrow({ world, amount: usdc(1000), maxModeratorFee: quoted });
      assert.fail("expected ModeratorFeeAboveMax");
    } catch (e) {
      assert.include(e.toString(), "ModeratorFeeAboveMax");
    }
  });

  it("accepts a price exactly at the agreed maximum", async () => {
    const s = await createEscrow({ amount: usdc(1000), maxModeratorFee: usdc(10) });
    const acc = await program.account.escrow.fetch(s.escrow);
    assert.ok(acc.moderatorSurcharge.eq(usdc(10)));
  });

  it("a zero maximum cannot make a moderator work for free", async () => {
    // The old bug, re-attempted through the new argument: 0 is a limit, not a
    // fee, so it refuses the escrow instead of creating an unpaid one.
    try {
      await createEscrow({ amount: usdc(1000), maxModeratorFee: new BN(0) });
      assert.fail("expected ModeratorFeeAboveMax");
    } catch (e) {
      assert.include(e.toString(), "ModeratorFeeAboveMax");
    }
  });
});
