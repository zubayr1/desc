import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  tokenBalance,
  accountExists,
  sleep,
  TOKEN_PROGRAM_ID,
} from "./helpers";

async function refund(s: any) {
  await program.methods
    .refund()
    .accountsPartial({
      initiator: s.initiator.publicKey,
      escrow: s.escrow,
      vault: s.vault,
      initiatorTokenAccount: s.initiatorAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([s.initiator])
    .rpc();
}

describe("refund", () => {
  it("refunds the full deposit on a Fail verdict", async () => {
    const s = await createEscrow();
    const total = s.amount.add(s.fee).add(s.surcharge);
    const c = await acceptEscrow(s);
    await submitEscrow(s, c);
    await recordVerdict(s, "fail");

    await refund(s);

    assert.equal((await tokenBalance(s.initiatorAta)).toString(), total.toString());
    assert.isFalse(await accountExists(s.vault));
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");
  });

  it("refunds a ghosting committer after the deadline", async () => {
    const s = await createEscrow({ deadlineOffset: 3 });
    const total = s.amount.add(s.fee).add(s.surcharge);
    await acceptEscrow(s);
    await sleep(5000);

    await refund(s);

    assert.equal((await tokenBalance(s.initiatorAta)).toString(), total.toString());
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");
  });

  it("rejects refund while Active before the deadline", async () => {
    const s = await createEscrow();
    await acceptEscrow(s);
    try {
      await refund(s);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });

  it("rejects refund when the verdict is Pass", async () => {
    const s = await createEscrow();
    const c = await acceptEscrow(s);
    await submitEscrow(s, c);
    await recordVerdict(s, "pass");
    try {
      await refund(s);
      assert.fail("expected InvalidStatus");
    } catch (e) {
      assert.include(e.toString(), "InvalidStatus");
    }
  });
});
