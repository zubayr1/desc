import { assert } from "chai";
import {
  program,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  voteOnPanel,
  setupWorld,
  addModerator,
  releaseEscrow,
  refundEscrow,
  moderatorReputationPda,
  fundedAta,
  usdc,
  BN,
  Keypair,
  PublicKey,
} from "./helpers";

/** What settlement writes to each moderator's `ModeratorReputation`. The
 *  ghost-timeout case lives in `ghost_timeout.test.ts`. */

interface Seat {
  wallet: Keypair;
  pda: PublicKey;
  ata: PublicKey;
}

/** Read a moderator's record straight from the chain. */
async function repOf(wallet: PublicKey) {
  return program.account.moderatorReputation.fetch(moderatorReputationPda(wallet));
}

/** All counters at once, so a wrong one names itself. */
async function assertRep(
  label: string,
  wallet: PublicKey,
  expected: {
    verdictsCast: number;
    panelVerdicts: number;
    majorityAgreements: number;
    failVotes: number;
    missed?: number;
  }
) {
  const r = await repOf(wallet);
  assert.deepEqual(
    {
      verdictsCast: r.verdictsCast,
      panelVerdicts: r.panelVerdicts,
      majorityAgreements: r.majorityAgreements,
      failVotes: r.failVotes,
      missed: r.missed,
    },
    { missed: 0, ...expected },
    label
  );
}

/** A submitted escrow judged by three moderators. */
async function panelOfThree(amount = usdc(1000)) {
  const bps = [100, 50, 75];
  const world = await setupWorld(200, 0, 0, bps[0]);
  const members = [
    { wallet: world.moderator, pda: world.moderatorPda },
    await addModerator(world, { baseBps: bps[1] }),
    await addModerator(world, { baseBps: bps[2] }),
  ];

  const seats: Seat[] = [];
  for (const m of members) {
    seats.push({
      wallet: m.wallet,
      pda: m.pda,
      ata: await fundedAta(
        world.mintAuthority,
        world.mint,
        m.wallet.publicKey,
        0,
        world.mintAuthority
      ),
    });
  }

  const s = await createEscrow({
    world,
    amount,
    moderators: seats.map((x) => x.pda),
    moderatorBps: bps,
  });
  const committer = await acceptEscrow(s);
  const committerAta = await fundedAta(
    world.mintAuthority,
    world.mint,
    committer.publicKey,
    0,
    world.mintAuthority
  );
  await submitEscrow(s, committer);
  return { world, s, committer, committerAta, seats };
}

describe("moderator reputation", () => {
  it("credits the majority and not the moderator it outvoted", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();

    await voteOnPanel(s, [
      { by: seats[0].wallet, outcome: "pass" },
      { by: seats[1].wallet, outcome: "pass" },
      { by: seats[2].wallet, outcome: "fail" },
    ]);

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });

    for (const i of [0, 1]) {
      await assertRep(`seat ${i} agreed with the majority`, seats[i].wallet.publicKey, {
        verdictsCast: 1,
        panelVerdicts: 1,
        majorityAgreements: 1,
        failVotes: 0,
      });
    }
    // Paid for its work (see panel_payout), but credited with no agreement.
    await assertRep("the outvoted seat", seats[2].wallet.publicKey, {
      verdictsCast: 1,
      panelVerdicts: 1,
      majorityAgreements: 0,
      failVotes: 1,
    });
  });

  it("scores a vote that lands after the outcome is already final", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();

    // The third reveal lands after the first two already decided it.
    await voteOnPanel(s, seats.map((x) => ({ by: x.wallet, outcome: "pass" as const })));

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });

    await assertRep("the late voter", seats[2].wallet.publicKey, {
      verdictsCast: 1,
      panelVerdicts: 1,
      majorityAgreements: 1,
      failVotes: 0,
    });
  });

  it("marks a seat that never voted as missed, and unpaid", async () => {
    const { s, committer, committerAta, seats } = await panelOfThree();

    await voteOnPanel(s, [
      { by: seats[0].wallet, outcome: "pass" },
      { by: seats[1].wallet, outcome: "pass" },
    ]);

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });

    await assertRep("the silent seat", seats[2].wallet.publicKey, {
      verdictsCast: 0,
      panelVerdicts: 0,
      majorityAgreements: 0,
      failVotes: 0,
      missed: 1,
    });
  });

  it("counts a Fail settlement, which refund pays out rather than release", async () => {
    const { s, seats } = await panelOfThree();

    await voteOnPanel(s, seats.map((x) => ({ by: x.wallet, outcome: "fail" as const })));
    await refundEscrow(s);

    // The panel settled Fail, so a Fail vote AGREED with it. Scoring lives in
    // the shared `settle_panel`, so the refund path must record exactly as the
    // release path does.
    for (const [i, seat] of seats.entries()) {
      await assertRep(`seat ${i} on a Fail`, seat.wallet.publicKey, {
        verdictsCast: 1,
        panelVerdicts: 1,
        majorityAgreements: 1,
        failVotes: 1,
      });
    }
  });

  it("counts a solo moderator's volume but not its accuracy", async () => {
    const world = await setupWorld(200, 0, 0, 100);
    const s = await createEscrow({ world, amount: usdc(1000) });
    const committer = await acceptEscrow(s);
    const committerAta = await fundedAta(
      world.mintAuthority,
      world.mint,
      committer.publicKey,
      0,
      world.mintAuthority
    );
    await fundedAta(
      world.mintAuthority,
      world.mint,
      world.moderator.publicKey,
      0,
      world.mintAuthority
    );
    await submitEscrow(s, committer);
    await recordVerdict(s, "pass");
    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });

    // On a panel of one the moderator IS the majority, so agreement is
    // meaningless — it would read 100% forever. Volume still counts.
    await assertRep("the solo moderator", world.moderator.publicKey, {
      verdictsCast: 1,
      panelVerdicts: 0,
      majorityAgreements: 0,
      failVotes: 0,
    });
  });

  it("accumulates across contracts instead of overwriting", async () => {
    const world = await setupWorld(200, 0, 0, 100);
    await fundedAta(
      world.mintAuthority,
      world.mint,
      world.moderator.publicKey,
      0,
      world.mintAuthority
    );

    // The same moderator judges two separate deals. The account outlives both
    // escrows, which are closed on settle — that persistence is the whole
    // reason the counters exist on chain at all.
    for (let i = 0; i < 2; i++) {
      const s = await createEscrow({ world, amount: usdc(1000) });
      const committer = await acceptEscrow(s);
      await fundedAta(
        world.mintAuthority,
        world.mint,
        committer.publicKey,
        0,
        world.mintAuthority
      );
      await submitEscrow(s, committer);
      await recordVerdict(s, "fail");
      await refundEscrow(s);
    }

    await assertRep("after two contracts", world.moderator.publicKey, {
      verdictsCast: 2,
      panelVerdicts: 0,
      majorityAgreements: 0,
      failVotes: 2,
    });
  });
});
