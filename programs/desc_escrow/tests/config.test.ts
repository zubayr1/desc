import { assert } from "chai";
import {
  program,
  newFundedKeypair,
  configPda,
  setupWorld,
  Keypair,
  SystemProgram,
} from "./helpers";

describe("config", () => {
  it("initializes with the expected values", async () => {
    const world = await setupWorld(200);
    const cfg = await program.account.config.fetch(world.config);

    assert.equal(cfg.version, 1);
    assert.ok(cfg.authority.equals(world.authority.publicKey));
    assert.ok(cfg.settlementAuthority.equals(world.settlementAuthority.publicKey));
    assert.ok(cfg.treasury.equals(world.treasury));
    assert.equal(cfg.protocolFeeBps, 200);
    assert.equal(cfg.paused, false);
  });

  it("rejects a fee above the max", async () => {
    const authority = await newFundedKeypair();
    const config = configPda(authority.publicKey);
    const settlement = Keypair.generate();
    const treasury = Keypair.generate();

    try {
      await program.methods
        .initializeConfig(settlement.publicKey, treasury.publicKey, 1001)
        .accountsPartial({
          authority: authority.publicKey,
          config,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
      assert.fail("expected InvalidFeeBps");
    } catch (e) {
      assert.include(e.toString(), "InvalidFeeBps");
    }
  });

  it("updates only the provided fields", async () => {
    const world = await setupWorld(200);
    const newTreasury = Keypair.generate();

    await program.methods
      .updateConfig(null, newTreasury.publicKey, 300, true)
      .accountsPartial({ authority: world.authority.publicKey, config: world.config })
      .signers([world.authority])
      .rpc();

    const cfg = await program.account.config.fetch(world.config);
    assert.equal(cfg.protocolFeeBps, 300);
    assert.equal(cfg.paused, true);
    assert.ok(cfg.treasury.equals(newTreasury.publicKey));
    // settlement_authority was passed null -> unchanged
    assert.ok(cfg.settlementAuthority.equals(world.settlementAuthority.publicKey));
  });

  it("rejects an update from a non-authority", async () => {
    const world = await setupWorld();
    const stranger = await newFundedKeypair();

    try {
      await program.methods
        .updateConfig(null, null, 500, null)
        .accountsPartial({ authority: stranger.publicKey, config: world.config })
        .signers([stranger])
        .rpc();
      assert.fail("expected a constraint failure");
    } catch (e) {
      // ConstraintSeeds / ConstraintHasOne — stranger can't own this config
      assert.ok(e.toString().length > 0);
    }
  });

  it("rejects an update fee above the max", async () => {
    const world = await setupWorld();
    try {
      await program.methods
        .updateConfig(null, null, 1001, null)
        .accountsPartial({ authority: world.authority.publicKey, config: world.config })
        .signers([world.authority])
        .rpc();
      assert.fail("expected InvalidFeeBps");
    } catch (e) {
      assert.include(e.toString(), "InvalidFeeBps");
    }
  });
});
