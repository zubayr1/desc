import { assert } from "chai";
import {
  program,
  newFundedKeypair,
  configPda,
  setupWorld,
  Keypair,
  SystemProgram,
  BN,
  usdc,
  expectError,
} from "./helpers";

describe("config", () => {
  it("initializes with the expected values", async () => {
    const world = await setupWorld(200);
    const cfg = await program.account.config.fetch(world.config);

    assert.equal(cfg.version, 2);
    assert.ok(cfg.authority.equals(world.authority.publicKey));
    assert.ok(cfg.settlementAuthority.equals(world.settlementAuthority));
    assert.ok(cfg.treasury.equals(world.treasury));
    assert.equal(cfg.protocolFeeBps, 200);
    assert.equal(cfg.protocolFeeMin.toNumber(), 0); // no floor by default
    assert.equal(cfg.minAmount.toNumber(), 0); // no minimum by default
    assert.equal(cfg.paused, false);
  });

  it("rejects a fee above the max", async () => {
    const authority = await newFundedKeypair();
    const config = configPda(authority.publicKey);
    const settlement = Keypair.generate();
    const treasury = Keypair.generate();

    await expectError(async () => {
      await program.methods
        .initializeConfig(settlement.publicKey, treasury.publicKey, 1001, new BN(0), new BN(0))
        .accountsPartial({
          authority: authority.publicKey,
          config,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    }, "InvalidFeeBps");
  });

  it("updates only the provided fields", async () => {
    const world = await setupWorld(200);
    const newTreasury = Keypair.generate();

    await program.methods
      .updateConfig(null, newTreasury.publicKey, 300, null, null, true, null)
      .accountsPartial({ authority: world.authority.publicKey, config: world.config })
      .signers([world.authority])
      .rpc();

    const cfg = await program.account.config.fetch(world.config);
    assert.equal(cfg.protocolFeeBps, 300);
    assert.equal(cfg.paused, true);
    assert.ok(cfg.treasury.equals(newTreasury.publicKey));
    // settlement_authority was passed null -> unchanged
    assert.ok(cfg.settlementAuthority.equals(world.settlementAuthority));
  });

  it("rejects an update from a non-authority", async () => {
    const world = await setupWorld();
    const stranger = await newFundedKeypair();

    // ConstraintSeeds / ConstraintHasOne — stranger can't own this config
    await expectError(async () => {
      await program.methods
        .updateConfig(null, null, 500, null, null, null, null)
        .accountsPartial({ authority: stranger.publicKey, config: world.config })
        .signers([stranger])
        .rpc();
    });
  });

  it("rejects a fee floor above the max", async () => {
    const authority = await newFundedKeypair();
    const config = configPda(authority.publicKey);
    const settlement = Keypair.generate();
    const treasury = Keypair.generate();

    await expectError(async () => {
      await program.methods
        .initializeConfig(
          settlement.publicKey,
          treasury.publicKey,
          200,
          new BN(100_000_001), // MAX_FEE_MIN is 100_000_000
          new BN(0)
        )
        .accountsPartial({
          authority: authority.publicKey,
          config,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    }, "InvalidFeeMin");
  });

  it("rejects an update fee floor above the max", async () => {
    const world = await setupWorld();
    await expectError(async () => {
      await program.methods
        .updateConfig(null, null, null, new BN(100_000_001), null, null, null)
        .accountsPartial({ authority: world.authority.publicKey, config: world.config })
        .signers([world.authority])
        .rpc();
    }, "InvalidFeeMin");
  });

  it("rejects a fee floor above the minimum contract amount", async () => {
    const world = await setupWorld(200, usdc(1).toNumber(), usdc(50).toNumber());
    await expectError(async () => {
      await program.methods
        // floor of $60 on a $50 minimum -> a minimum-sized deal pays >100% fee
        .updateConfig(null, null, null, usdc(60), null, null, null)
        .accountsPartial({ authority: world.authority.publicKey, config: world.config })
        .signers([world.authority])
        .rpc();
    }, "FeeFloorAboveMinimum");
  });

  it("allows raising the floor and the minimum in one call", async () => {
    const world = await setupWorld(200, usdc(1).toNumber(), usdc(50).toNumber());
    // Order-independent: checked on the result, not field by field.
    await program.methods
      .updateConfig(null, null, null, usdc(60), usdc(100), null, null)
      .accountsPartial({ authority: world.authority.publicKey, config: world.config })
      .signers([world.authority])
      .rpc();

    const cfg = await program.account.config.fetch(world.config);
    assert.ok(cfg.protocolFeeMin.eq(usdc(60)));
    assert.ok(cfg.minAmount.eq(usdc(100)));
  });

  it("rejects an update fee above the max", async () => {
    const world = await setupWorld();
    await expectError(async () => {
      await program.methods
        .updateConfig(null, null, 1001, null, null, null, null)
        .accountsPartial({ authority: world.authority.publicKey, config: world.config })
        .signers([world.authority])
        .rpc();
    }, "InvalidFeeBps");
  });
});
