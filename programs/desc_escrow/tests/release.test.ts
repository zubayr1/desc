import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  fundedAta,
  tokenBalance,
  accountExists,
  TOKEN_PROGRAM_ID,
} from "./helpers";

async function ready(outcome: "pass" | "fail" | null) {
  const s = await createEscrow();
  const c = await acceptEscrow(s);
  await submitEscrow(s, c);
  const committerAta = await fundedAta(
    s.world.mintAuthority,
    s.world.mint,
    c.publicKey,
    0,
    s.world.mintAuthority
  );
  if (outcome) await recordVerdict(s, outcome);
  return { s, c, committerAta };
}

async function release(s: any, c: any, committerAta: any, signer = c) {
  await program.methods
    .release()
    .accountsPartial({
      signer: signer.publicKey,
      escrow: s.escrow,
      config: s.world.config,
      vault: s.vault,
      committerTokenAccount: committerAta,
      treasury: s.world.treasury,
      moderatorTokenAccount: s.world.moderatorAta,
      initiator: s.initiator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([signer])
    .rpc();
}

describe("release", () => {
  it("pays committer + treasury and settles (called by committer)", async () => {
    const { s, c, committerAta } = await ready("pass");
    await release(s, c, committerAta);

    assert.equal((await tokenBalance(committerAta)).toString(), s.amount.toString());
    // Treasury keeps the whole protocol fee on a Pass; the surcharge is the
    // judging moderator's reward, not the protocol's.
    assert.equal((await tokenBalance(s.world.treasury)).toString(), s.fee.toString());
    assert.equal(
      (await tokenBalance(s.world.moderatorAta)).toString(),
      s.surcharge.toString()
    );
    assert.isFalse(await accountExists(s.vault));
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "settled");
  });

  it("can also be called by the initiator", async () => {
    const { s, c, committerAta } = await ready("pass");
    await release(s, c, committerAta, s.initiator);
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "settled");
  });

  it("rejects release before a verdict", async () => {
    const { s, c, committerAta } = await ready(null);
    try {
      await release(s, c, committerAta);
      assert.fail("expected a rejection");
    } catch (e) {
      // `escrow.moderator` is still default before a verdict, so the
      // `moderator_token_account.owner == escrow.moderator` account constraint
      // fires before the handler's InvalidStatus check. Either way there is no
      // path to a payout — assert the rejection, not the specific error.
      assert.include(e.toString(), "moderator_token_account");
    }
  });

  it("rejects release when the verdict is Fail", async () => {
    const { s, c, committerAta } = await ready("fail");
    try {
      await release(s, c, committerAta);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });
});
