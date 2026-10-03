import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  setupWorld,
  tokenBalance,
  chainUnixTs,
  waitForChainTime,
  usdc,
  refundEscrow,
  moderatorReputationPda,
} from "./helpers";

/**
 * The ghost-timeout path, in its own file on purpose.
 *
 * It is the only test that must wait for the validator's clock to advance past
 * a deadline, and that clock runs well behind wall time and slows further the
 * longer the validator has been up. Run alongside other tests it starves and
 * times out; run first on a fresh validator (see ../run-tests.sh) it passes.
 */
async function refund(s: any) {
  // No verdict was rendered, so no moderator voted and none is paid.
  await refundEscrow(s);
}

describe("ghost timeout", () => {
  it("charges nothing when the committer never delivers", async () => {
    const world = await setupWorld(200, usdc(1).toNumber());
    // Deadlines are compared against the VALIDATOR's clock, not wall time.
    const deadline = (await chainUnixTs()) + 5;
    const s = await createEscrow({ world, deadlineAbsolute: deadline });
    const total = s.amount.add(s.fee).add(s.surcharge);
    await acceptEscrow(s);
    await waitForChainTime(deadline);

    await refund(s);

    // No moderator did any work, so the initiator is made whole.
    assert.equal((await tokenBalance(s.initiatorAta)).toString(), total.toString());
    assert.equal((await tokenBalance(world.treasury)).toString(), "0");
    assert.property((await program.account.escrow.fetch(s.escrow)).status, "refunded");

    // And nobody is SCORED either. A moderator is scored exactly when it is
    // paid, so a deal nobody judged must leave every record untouched — the
    // seat was assigned, which is not the same as having done the work.
    const rep = await program.account.moderatorReputation.fetch(
      moderatorReputationPda(world.moderator.publicKey)
    );
    assert.equal(rep.verdictsCast, 0);
    assert.equal(rep.panelVerdicts, 0);
    assert.equal(rep.majorityAgreements, 0);
    assert.equal(rep.failVotes, 0);
  });
});
