import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  tokenBalance,
  accountExists,
  newFundedKeypair,
  TOKEN_PROGRAM_ID,
} from "./helpers";

async function cancel(s: any, signer = s.initiator) {
  await program.methods
    .cancel()
    .accountsPartial({
      initiator: signer.publicKey,
      escrow: s.escrow,
      vault: s.vault,
      initiatorTokenAccount: s.initiatorAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([signer])
    .rpc();
}

describe("cancel", () => {
  it("refunds the initiator and closes the vault", async () => {
    const s = await createEscrow();
    const total = s.amount.add(s.fee).add(s.surcharge);

    await cancel(s);

    assert.equal((await tokenBalance(s.initiatorAta)).toString(), total.toString());
    assert.isFalse(await accountExists(s.vault));
    const acc = await program.account.escrow.fetch(s.escrow);
    assert.property(acc.status, "cancelled");
  });

  it("cannot cancel once accepted", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    try {
      await cancel(s);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });

  it("cannot be cancelled by a non-initiator", async () => {
    const s = await createEscrow();
    const stranger = await newFundedKeypair();
    try {
      await cancel(s, stranger);
      assert.fail("expected a failure");
    } catch (e) {
      assert.ok(e.toString().length > 0);
    }
  });
});
