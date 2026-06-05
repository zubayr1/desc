import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  tokenBalance,
  accountExists,
  newFundedKeypair,
  TOKEN_PROGRAM_ID,
} from "./helpers";

async function mutualCancel(s: any, committer: any, signers: any[]) {
  await program.methods
    .mutualCancel()
    .accountsPartial({
      initiator: s.initiator.publicKey,
      committer: committer.publicKey,
      escrow: s.escrow,
      vault: s.vault,
      initiatorTokenAccount: s.initiatorAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers(signers)
    .rpc();
}

describe("mutual_cancel", () => {
  it("both sign to unwind an Active escrow", async () => {
    const s = await createEscrow();
    const total = s.amount.add(s.fee).add(s.surcharge);
    const c = await acceptEscrow(s);

    await mutualCancel(s, c, [s.initiator, c]);

    assert.equal((await tokenBalance(s.initiatorAta)).toString(), total.toString());
    assert.isFalse(await accountExists(s.vault));
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");
  });

  it("works from Submitted too", async () => {
    const s = await createEscrow();
    const c = await acceptEscrow(s);
    await submitEscrow(s, c);
    await mutualCancel(s, c, [s.initiator, c]);
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");
  });

  it("rejects a wrong committer co-signer", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    const stranger = await newFundedKeypair();
    try {
      await mutualCancel(s, stranger, [s.initiator, stranger]);
      assert.fail("expected Unauthorized");
    } catch (e) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  it("rejects before acceptance (Funded)", async () => {
    const s = await createEscrow();
    const stranger = await newFundedKeypair();
    try {
      await mutualCancel(s, stranger, [s.initiator, stranger]);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });
});
