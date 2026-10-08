import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  tokenBalance,
  accountExists,
  newFundedKeypair,
  TOKEN_PROGRAM_ID,
  expectError,
} from "./helpers";

async function cancel(s: any, signer = s.initiator) {
  await program.methods
    .cancel()
    .accountsPartial({
      initiator: signer.publicKey,
      escrow: s.escrow,
      panel: s.panel,
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
    await expectError(async () => {
      await cancel(s);
    }, "InvalidStatus");
  });

  it("cannot be cancelled by a non-initiator", async () => {
    const s = await createEscrow();
    const stranger = await newFundedKeypair();
    await expectError(async () => {
      await cancel(s, stranger);
    });
  });
});
