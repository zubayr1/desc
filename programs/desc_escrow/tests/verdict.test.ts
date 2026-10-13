import { assert } from "chai";
import { randomBytes } from "crypto";
import {
  program,
  moderation,
  setupWorld,
  addModerator,
  addTiebreaker,
  createEscrow,
  acceptEscrow,
  submitEscrow,
  recordVerdict,
  commitVote,
  revealVote,
  voteOnPanel,
  commitHash,
  submitTiebreak,
  finalizeEscrow,
  waitPastCommits,
  waitPastVoting,
  releaseEscrow,
  refundEscrow,
  fundedAta,
  tokenBalance,
  moderatorReputationPda,
  moderatorPda,
  expectError,
  chainUnixTs,
  usdc,
  BN,
  Keypair,
  PublicKey,
  World,
  EscrowSetup,
} from "./helpers";

const WINDOW = 8;
const VOTE_MISMATCH = 4;

interface Seat {
  wallet: Keypair;
  ata: PublicKey;
  fee: BN;
}

async function rep(wallet: PublicKey) {
  return program.account.moderatorReputation.fetch(moderatorReputationPda(wallet));
}

async function seatVotes(s: EscrowSetup) {
  const panel = await program.account.panel.fetch(s.panel);
  return panel.entries.slice(0, panel.count).map((e) => e.vote);
}

async function escrowOf(s: EscrowSetup) {
  return program.account.escrow.fetch(s.escrow);
}

async function submitted(world: World, moderators: PublicKey[], bps: number[]) {
  const amount = usdc(1000);
  const s = await createEscrow({ world, amount, moderators, moderatorBps: bps });
  const committer = await acceptEscrow(s);
  const committerAta = await fundedAta(world.mintAuthority, world.mint, committer.publicKey, 0, world.mintAuthority);
  await submitEscrow(s, committer);
  return { s, committer, committerAta };
}

async function panelOfThree() {
  const bps = [100, 50, 75];
  const world = await setupWorld(200, 0, 0, bps[0], WINDOW);
  const members = [
    world.moderator,
    (await addModerator(world, { baseBps: bps[1] })).wallet,
    (await addModerator(world, { baseBps: bps[2] })).wallet,
  ];
  const seats: Seat[] = [];
  for (const [i, wallet] of members.entries()) {
    seats.push({
      wallet,
      ata: await fundedAta(world.mintAuthority, world.mint, wallet.publicKey, 0, world.mintAuthority),
      fee: usdc(1000).mul(new BN(bps[i])).div(new BN(10_000)),
    });
  }
  const t = await submitted(world, members.map((m) => moderatorPda(m.publicKey)), bps);
  return { world, seats, ...t };
}

async function panelOfOne() {
  const world = await setupWorld(200, 0, 0, 100, WINDOW);
  const t = await submitted(world, [world.moderatorPda], [100]);
  return { world, ...t };
}

describe("commit–reveal", () => {
  it("records a reveal that doesn't match its commit, and burns the seat", async () => {
    const { s, seats } = await panelOfThree();
    for (const x of seats) await commitVote(s, "pass", Array(32).fill(1), x.wallet);
    await revealVote(s, seats[0].wallet, { outcome: "fail" });
    assert.equal((await seatVotes(s))[0], VOTE_MISMATCH);
    await expectError(() => revealVote(s, seats[0].wallet), "NotCommitted");
  });

  it("rejects a reveal not signed by the seat's moderator", async () => {
    const { s, seats } = await panelOfThree();
    for (const x of seats) await commitVote(s, "pass", Array(32).fill(1), x.wallet);
    await expectError(() => revealVote(s, seats[0].wallet, undefined, seats[1].wallet), "Unauthorized");
    assert.equal((await seatVotes(s))[0], 3, "still committed");
  });

  it("rejects a commit copied from another escrow", async () => {
    const a = await panelOfThree();
    const salt = randomBytes(32);
    const hash = Array(32).fill(4);
    const forA = commitHash("pass", hash, salt, a.seats[0].wallet.publicKey, a.s.escrow);

    const b = await submitted(a.world, a.seats.map((x) => moderatorPda(x.wallet.publicKey)), [100, 50, 75]);
    await commitVote(b.s, "pass", hash, a.seats[0].wallet, forA);
    await commitVote(b.s, "pass", Array(32).fill(1), a.seats[1].wallet);
    await commitVote(b.s, "pass", Array(32).fill(1), a.seats[2].wallet);

    await revealVote(b.s, a.seats[0].wallet, { outcome: "pass", hash, salt });
    assert.equal((await seatVotes(b.s))[0], VOTE_MISMATCH, "the copied commit is caught and burned");
  });

  it("rejects a reveal before reveals open", async () => {
    const { s, seats } = await panelOfThree();
    await commitVote(s, "pass", Array(32).fill(1), seats[0].wallet);
    await commitVote(s, "pass", Array(32).fill(1), seats[1].wallet);
    await expectError(() => revealVote(s, seats[0].wallet), "RevealNotOpen");
  });

  it("opens reveals early once every seat has committed", async () => {
    const { s, seats } = await panelOfThree();
    const before = await escrowOf(s);
    for (const x of seats) await commitVote(s, "pass", Array(32).fill(1), x.wallet);
    const after = await escrowOf(s);
    assert.isTrue(after.revealDeadline.lt(before.revealDeadline), "reveal window pulled forward");
    await revealVote(s, seats[0].wallet);
  });

  it("gives a committed seat its reveal window even after a majority", async () => {
    const { s, seats, committer, committerAta } = await panelOfThree();
    for (const x of seats) await commitVote(s, "pass", Array(32).fill(1), x.wallet);
    await revealVote(s, seats[0].wallet);
    await revealVote(s, seats[1].wallet);
    assert.property((await escrowOf(s)).outcome, "pass");

    await expectError(
      () => releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta }),
      "AwaitingReveals"
    );
    await revealVote(s, seats[2].wallet);
    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });
    assert.equal((await tokenBalance(seats[2].ata)).toString(), seats[2].fee.toString());
  });

  it("leaves a seat that committed but never revealed unpaid and missed", async () => {
    const { s, seats, committer, committerAta } = await panelOfThree();
    for (const x of seats) await commitVote(s, "pass", Array(32).fill(1), x.wallet);
    await revealVote(s, seats[0].wallet);
    await revealVote(s, seats[1].wallet);
    await waitPastVoting(s);

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });
    assert.equal((await tokenBalance(seats[2].ata)).toString(), "0");
    assert.equal((await tokenBalance(s.initiatorAta)).toString(), seats[2].fee.toString());
    assert.equal((await rep(seats[2].wallet.publicKey)).missed, 1);
    assert.equal((await rep(seats[0].wallet.publicKey)).missed, 0);
  });

  it("rejects a direct vote on a panel of three", async () => {
    const { s, seats } = await panelOfThree();
    await expectError(() => recordVerdict(s, "pass", Array(32).fill(1), seats[0].wallet), "WrongVotingMode");
  });

  it("rejects a commit on a panel of one", async () => {
    const { s, world } = await panelOfOne();
    await expectError(() => commitVote(s, "pass", Array(32).fill(1), world.moderator), "WrongVotingMode");
  });

  it("rejects a vote after the window closes", async () => {
    const { s } = await panelOfOne();
    await waitPastVoting(s);
    await expectError(() => recordVerdict(s, "pass"), "VotingClosed");
  });

  it("rejects Inconclusive as a vote", async () => {
    const { s, world } = await panelOfOne();
    await expectError(
      () =>
        moderation.methods
          .submitVerdict({ inconclusive: {} } as any, Array(32).fill(1))
          .accountsPartial({
            authority: world.moderator.publicKey,
            config: world.modConfig,
            verdictAuthority: world.settlementAuthority,
            moderator: world.moderatorPda,
            escrowConfig: world.config,
            escrow: s.escrow,
            panel: s.panel,
            descEscrowProgram: program.programId,
          })
          .signers([world.moderator])
          .rpc(),
      "InvalidVote"
    );
  });
});

describe("tiebreakers", () => {
  it("breaks a 1-1 with a silent seat, inheriting that seat's fee", async () => {
    const { world, s, seats, committer, committerAta } = await panelOfThree();
    const t = await addTiebreaker(world);
    await voteOnPanel(s, [
      { by: seats[0].wallet, outcome: "pass" },
      { by: seats[1].wallet, outcome: "fail" },
    ]);
    assert.isNull((await escrowOf(s)).outcome);
    await waitPastVoting(s);

    await submitTiebreak(s, "pass", t.wallet);
    assert.property((await escrowOf(s)).outcome, "pass");
    const panel = await program.account.panel.fetch(s.panel);
    assert.ok(panel.entries[2].moderator.equals(t.wallet.publicKey), "fills the silent seat");
    assert.equal(panel.tiebreakFills, 1);

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });
    const tAta = await fundedAta(world.mintAuthority, world.mint, t.wallet.publicKey, 0, world.mintAuthority);
    assert.equal((await tokenBalance(tAta)).toString(), seats[2].fee.toString());
    assert.equal((await rep(seats[2].wallet.publicKey)).missed, 1, "replaced moderator marked missed");
  });

  it("decides a panel of one whose moderator went silent", async () => {
    const { world, s } = await panelOfOne();
    const t = await addTiebreaker(world);
    await waitPastVoting(s);
    await submitTiebreak(s, "fail", t.wallet);
    assert.property((await escrowOf(s)).outcome, "fail");
    await refundEscrow(s);
  });

  it("caps a panel of three at two tiebreaks, then ends Inconclusive", async () => {
    const { world, s, seats } = await panelOfThree();
    const [t1, t2, t3] = [await addTiebreaker(world), await addTiebreaker(world), await addTiebreaker(world)];
    await waitPastCommits(s);
    await waitPastVoting(s);

    await submitTiebreak(s, "pass", t1.wallet);
    await submitTiebreak(s, "fail", t2.wallet);
    await expectError(() => submitTiebreak(s, "pass", t3.wallet), "TiebreakCapReached");

    await finalizeEscrow(s);
    assert.property((await escrowOf(s)).outcome, "inconclusive");

    await refundEscrow(s);
    // Voters paid, the silent seat's fee and the whole protocol fee come back.
    assert.equal(
      (await tokenBalance(s.initiatorAta)).toString(),
      s.amount.add(s.fee).add(seats[2].fee).toString()
    );
    assert.equal((await tokenBalance(world.treasury)).toString(), "0");

    const r1 = await rep(t1.wallet.publicKey);
    assert.deepEqual(
      [r1.verdictsCast, r1.panelVerdicts, r1.majorityAgreements],
      [1, 0, 0],
      "Inconclusive scores nobody as right or wrong"
    );
    for (const x of seats) assert.equal((await rep(x.wallet.publicKey)).missed, 1);
  });

  it("rejects a tiebreak before voting closes", async () => {
    const { world, s } = await panelOfOne();
    const t = await addTiebreaker(world);
    await expectError(() => submitTiebreak(s, "pass", t.wallet), "TiebreakNotOpen");
  });

  it("rejects a tiebreak from a moderator that isn't a tiebreaker", async () => {
    const { world, s } = await panelOfOne();
    const plain = await addModerator(world);
    await waitPastVoting(s);
    await expectError(() => submitTiebreak(s, "pass", plain.wallet), "NotATiebreaker");
  });

  it("refuses a tiebreaker as a panel seat", async () => {
    const world = await setupWorld(200, 0, 0, 100, WINDOW);
    const t = await addTiebreaker(world);
    await expectError(
      () => createEscrow({ world, moderators: [t.pda], moderatorBps: [100] }),
      "TiebreakerNotSelectable"
    );
  });

  it("rejects finalize while a tiebreak is still possible", async () => {
    const { s } = await panelOfOne();
    await waitPastVoting(s);
    await expectError(() => finalizeEscrow(s), "NotFinalizable");
  });
});

describe("reveal mismatch", () => {
  it("doesn't hold settlement: the seat is unpaid and scored as mismatched", async () => {
    const { s, seats, committer, committerAta } = await panelOfThree();
    for (const x of seats) await commitVote(s, "pass", Array(32).fill(1), x.wallet);
    await revealVote(s, seats[0].wallet);
    await revealVote(s, seats[1].wallet);
    await revealVote(s, seats[2].wallet, { outcome: "fail" });
    assert.property((await escrowOf(s)).outcome, "pass");

    await releaseEscrow(s, { signer: committer, committerTokenAccount: committerAta });
    assert.equal((await tokenBalance(seats[2].ata)).toString(), "0");
    assert.equal((await tokenBalance(s.initiatorAta)).toString(), seats[2].fee.toString());
    const r = await rep(seats[2].wallet.publicKey);
    assert.deepEqual([r.mismatched, r.missed], [1, 0]);
  });

  it("Pass + Fail + mismatch: a tiebreaker steps in at once and takes the mismatched seat", async () => {
    const { world, s, seats } = await panelOfThree();
    const t = await addTiebreaker(world);
    await commitVote(s, "pass", Array(32).fill(1), seats[0].wallet);
    await commitVote(s, "fail", Array(32).fill(2), seats[1].wallet);
    await commitVote(s, "pass", Array(32).fill(3), seats[2].wallet);
    await revealVote(s, seats[0].wallet);
    await revealVote(s, seats[1].wallet);
    await revealVote(s, seats[2].wallet, { outcome: "fail" });
    assert.isNull((await escrowOf(s)).outcome);

    assert.isBelow(await chainUnixTs(), (await escrowOf(s)).revealDeadline.toNumber(), "reveal window still open");
    await submitTiebreak(s, "pass", t.wallet);
    assert.property((await escrowOf(s)).outcome, "pass");
    const panel = await program.account.panel.fetch(s.panel);
    assert.ok(panel.entries[2].moderator.equals(t.wallet.publicKey));
    const r = await rep(seats[2].wallet.publicKey);
    assert.deepEqual([r.mismatched, r.missed], [1, 0]);
  });

  it("two mismatches: tiebreakers fill both", async () => {
    const { world, s, seats } = await panelOfThree();
    const [t1, t2] = [await addTiebreaker(world), await addTiebreaker(world)];
    await commitVote(s, "fail", Array(32).fill(1), seats[0].wallet);
    await commitVote(s, "pass", Array(32).fill(2), seats[1].wallet);
    await commitVote(s, "pass", Array(32).fill(3), seats[2].wallet);
    await revealVote(s, seats[0].wallet);
    await revealVote(s, seats[1].wallet, { outcome: "fail" });
    await revealVote(s, seats[2].wallet, { outcome: "fail" });

    await submitTiebreak(s, "pass", t1.wallet);
    assert.isNull((await escrowOf(s)).outcome, "1-1 after the first fill");
    await submitTiebreak(s, "pass", t2.wallet);
    assert.property((await escrowOf(s)).outcome, "pass");
    assert.equal((await program.account.panel.fetch(s.panel)).tiebreakFills, 2);
    for (const x of [seats[1], seats[2]]) assert.equal((await rep(x.wallet.publicKey)).mismatched, 1);
  });

  it("a seat that never committed doesn't hold the tiebreak back past the commit window", async () => {
    const { world, s, seats } = await panelOfThree();
    const t = await addTiebreaker(world);
    await commitVote(s, "pass", Array(32).fill(1), seats[0].wallet);
    await commitVote(s, "fail", Array(32).fill(2), seats[1].wallet);
    await waitPastCommits(s);
    await revealVote(s, seats[0].wallet);
    await revealVote(s, seats[1].wallet);

    assert.isBelow(await chainUnixTs(), (await escrowOf(s)).revealDeadline.toNumber(), "reveal window still open");
    await submitTiebreak(s, "fail", t.wallet);
    assert.property((await escrowOf(s)).outcome, "fail");
    assert.equal((await rep(seats[2].wallet.publicKey)).missed, 1);
  });
});
