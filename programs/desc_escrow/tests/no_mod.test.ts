import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  setupWorld,
  fundedAta,
  tokenBalance,
  accountExists,
  usdc,
  BN,
  PublicKey,
  TOKEN_PROGRAM_ID,
} from "./helpers";

/** Release with no moderator account — the no-mod path. */
async function release(s: any, c: any, committerAta: any) {
  await program.methods
    .release()
    .accountsPartial({
      signer: c.publicKey,
      escrow: s.escrow,
      config: s.world.config,
      vault: s.vault,
      committerTokenAccount: committerAta,
      treasury: s.world.treasury,
      moderatorTokenAccount: null,
      initiator: s.initiator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([c])
    .rpc();
}

describe("no_mod", () => {
  it("charges the protocol fee only — no surcharge, no verification fee", async () => {
    const world = await setupWorld(200, usdc(1).toNumber(), usdc(50).toNumber());
    const s = await createEscrow({ world, amount: usdc(1000), noMod: true });

    const acc = await program.account.escrow.fetch(s.escrow);
    assert.isTrue(acc.noMod);
    assert.ok(acc.protocolFee.eq(usdc(20))); // 2% still applies
    assert.ok(acc.moderatorSurcharge.eq(new BN(0)));
    assert.equal(acc.moderatorCount, 0);
    // Nothing is ever verified, so there is no cost to recover.
    assert.ok(acc.verificationFee.eq(new BN(0)));
    // Deposit is amount + fee, with no moderator cut.
    assert.equal(
      (await tokenBalance(s.vault)).toString(),
      usdc(1020).toString()
    );
  });

  it("passes automatically on submit", async () => {
    const s = await createEscrow({ noMod: true });
    const c = await acceptEscrow(s);
    await submitEscrow(s, c);

    const acc = await program.account.escrow.fetch(s.escrow);
    assert.property(acc.status, "submitted");
    assert.property(acc.outcome, "pass");
    // Nobody judged it, and the record says so.
    assert.ok(acc.moderator.equals(PublicKey.default));
  });

  it("releases to the committer with no moderator account", async () => {
    const world = await setupWorld(200, usdc(1).toNumber(), usdc(50).toNumber());
    const s = await createEscrow({ world, amount: usdc(1000), noMod: true });
    const c = await acceptEscrow(s);
    const committerAta = await fundedAta(
      world.mintAuthority,
      world.mint,
      c.publicKey,
      0,
      world.mintAuthority
    );
    await submitEscrow(s, c);

    await release(s, c, committerAta);

    assert.equal((await tokenBalance(committerAta)).toString(), usdc(1000).toString());
    assert.equal((await tokenBalance(world.treasury)).toString(), usdc(20).toString());
    assert.equal((await tokenBalance(world.moderatorAta)).toString(), "0");
    assert.isFalse(await accountExists(s.vault));
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "settled");
  });

  it("rejects a no-mod escrow that still pays a moderator", async () => {
    try {
      await createEscrow({ noMod: true, moderatorCount: 1, surcharge: usdc(10) });
      assert.fail("expected ModeratorConfigMismatch");
    } catch (e) {
      assert.include(e.toString(), "ModeratorConfigMismatch");
    }
  });

  it("rejects a moderated escrow with no moderators", async () => {
    try {
      await createEscrow({ moderatorCount: 0 });
      assert.fail("expected ModeratorConfigMismatch");
    } catch (e) {
      assert.include(e.toString(), "ModeratorConfigMismatch");
    }
  });
});
