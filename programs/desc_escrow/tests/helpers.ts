import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { DescEscrow } from "../target/types/desc_escrow";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

export const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
export const program = anchor.workspace.descEscrow as Program<DescEscrow>;
export const connection = provider.connection;

export const USDC_DECIMALS = 6;
/** USDC base units for a whole-token amount. */
export const usdc = (n: number) => new BN(n).mul(new BN(1_000_000));

// ---------------------------------------------------------------------------
// Funding
// ---------------------------------------------------------------------------

export async function airdrop(pubkey: PublicKey, sol = 10) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

export async function newFundedKeypair(sol = 10): Promise<Keypair> {
  const kp = Keypair.generate();
  await airdrop(kp.publicKey, sol);
  return kp;
}

// ---------------------------------------------------------------------------
// PDA derivations (mirror the program seeds)
// ---------------------------------------------------------------------------

export function configPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), authority.toBuffer()],
    program.programId
  )[0];
}

export function escrowPda(initiator: PublicKey, cid: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), initiator.toBuffer(), Buffer.from(cid)],
    program.programId
  )[0];
}

export function vaultPda(escrow: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrow.toBuffer()],
    program.programId
  )[0];
}

/** A deterministic 16-byte contract id from a label. */
export function contractId(label: string): number[] {
  const buf = Buffer.alloc(16);
  buf.write(label.slice(0, 16));
  return Array.from(buf);
}

// ---------------------------------------------------------------------------
// SPL token helpers
// ---------------------------------------------------------------------------

export async function createUsdcMint(authority: Keypair): Promise<PublicKey> {
  return createMint(
    connection,
    authority,
    authority.publicKey,
    null,
    USDC_DECIMALS
  );
}

/** Create an ATA for `owner` and mint `amount` base units into it. */
export async function fundedAta(
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: BN | number,
  mintAuthority: Keypair
): Promise<PublicKey> {
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner
  );
  const amt = typeof amount === "number" ? amount : BigInt(amount.toString());
  if (Number(amt) > 0) {
    await mintTo(connection, payer, mint, ata.address, mintAuthority, amt);
  }
  return ata.address;
}

export async function tokenBalance(ata: PublicKey): Promise<bigint> {
  return (await getAccount(connection, ata)).amount;
}

export async function accountExists(pubkey: PublicKey): Promise<boolean> {
  return (await connection.getAccountInfo(pubkey)) !== null;
}

// ---------------------------------------------------------------------------
// World: a fully-initialized protocol config + mint, reused by many tests.
// Fresh authority each time so test files don't collide on the config PDA.
// ---------------------------------------------------------------------------

export interface World {
  authority: Keypair;
  settlementAuthority: Keypair;
  mintAuthority: Keypair;
  mint: PublicKey;
  treasuryOwner: Keypair;
  treasury: PublicKey;
  config: PublicKey;
  feeBps: number;
  /** Protocol fee floor, base units. Defaults to 0 so a world behaves exactly
   *  like the pre-floor protocol unless a test opts in. */
  feeMin: number;
  /** Smallest accepted contract amount, base units. Defaults to 0 (no minimum). */
  minAmount: number;
  /** Stands in for the judging moderator — `record_verdict` binds it and it
   *  receives the surcharge on settle. */
  moderator: Keypair;
  moderatorAta: PublicKey;
}

export async function setupWorld(
  feeBps = 200,
  feeMin = 0,
  minAmount = 0
): Promise<World> {
  const authority = await newFundedKeypair();
  const settlementAuthority = await newFundedKeypair();
  const mintAuthority = await newFundedKeypair();
  const mint = await createUsdcMint(mintAuthority);
  const treasuryOwner = Keypair.generate();
  const treasury = await fundedAta(
    mintAuthority,
    mint,
    treasuryOwner.publicKey,
    0,
    mintAuthority
  );
  const config = configPda(authority.publicKey);
  const moderator = Keypair.generate();
  const moderatorAta = await fundedAta(
    mintAuthority,
    mint,
    moderator.publicKey,
    0,
    mintAuthority
  );

  await program.methods
    .initializeConfig(
      settlementAuthority.publicKey,
      treasury,
      feeBps,
      new BN(feeMin),
      new BN(minAmount)
    )
    .accountsPartial({
      authority: authority.publicKey,
      config,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return {
    authority,
    settlementAuthority,
    mintAuthority,
    mint,
    treasuryOwner,
    treasury,
    config,
    feeBps,
    feeMin,
    minAmount,
    moderator,
    moderatorAta,
  };
}

// ---------------------------------------------------------------------------
// Escrow lifecycle helpers
// ---------------------------------------------------------------------------

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CLOCK_SYSVAR = new PublicKey("SysvarC1ock11111111111111111111111111111111");

/** The validator's `Clock::unix_timestamp` — what the program actually compares
 *  deadlines against. A local validator's clock drifts from wall time (and on a
 *  slow host drifts a lot), so deadline tests must use this, never `Date.now()`. */
export async function chainUnixTs(): Promise<number> {
  const info = await connection.getAccountInfo(CLOCK_SYSVAR);
  if (!info) throw new Error("clock sysvar unavailable");
  return Number(info.data.readBigInt64LE(32));
}

/** Block until the validator's clock has passed `ts`. */
export async function waitForChainTime(ts: number, timeoutMs = 120_000) {
  const started = Date.now();
  while ((await chainUnixTs()) <= ts) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`chain clock did not reach ${ts} within ${timeoutMs}ms`);
    }
    await sleep(1000);
  }
}

export interface EscrowSetup {
  world: World;
  initiator: Keypair;
  initiatorAta: PublicKey;
  cid: number[];
  escrow: PublicKey;
  vault: PublicKey;
  amount: BN;
  fee: BN;
  surcharge: BN;
  moderatorCount: number;
  deadline: BN;
}

let labelCounter = 0;

export async function createEscrow(opts?: {
  world?: World;
  amount?: BN;
  surcharge?: BN;
  moderatorCount?: number;
  deadlineOffset?: number;
  /** Absolute deadline in CHAIN time. Use with `chainUnixTs()` for deadline
   *  tests; `deadlineOffset` is wall-relative and only safe for far futures. */
  deadlineAbsolute?: number;
}): Promise<EscrowSetup> {
  const world = opts?.world ?? (await setupWorld());
  const amount = opts?.amount ?? usdc(1000);
  const surcharge = opts?.surcharge ?? usdc(30);
  const moderatorCount = opts?.moderatorCount ?? 3;
  const deadlineOffset = opts?.deadlineOffset ?? 3600;

  const initiator = await newFundedKeypair();
  // Mirrors the program: max(bps of amount, the configured floor).
  const fee = BN.max(
    amount.mul(new BN(world.feeBps)).div(new BN(10_000)),
    new BN(world.feeMin)
  );
  const total = amount.add(fee).add(surcharge);
  const initiatorAta = await fundedAta(
    world.mintAuthority,
    world.mint,
    initiator.publicKey,
    total,
    world.mintAuthority
  );

  const cid = contractId("deal-" + labelCounter++);
  const escrow = escrowPda(initiator.publicKey, cid);
  const vault = vaultPda(escrow);
  const deadline = new BN(
    opts?.deadlineAbsolute ?? Math.floor(Date.now() / 1000) + deadlineOffset
  );

  await program.methods
    .createEscrow(cid, amount, moderatorCount, surcharge, deadline)
    .accountsPartial({
      initiator: initiator.publicKey,
      config: world.config,
      mint: world.mint,
      escrow,
      vault,
      initiatorTokenAccount: initiatorAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([initiator])
    .rpc();

  return {
    world,
    initiator,
    initiatorAta,
    cid,
    escrow,
    vault,
    amount,
    fee,
    surcharge,
    moderatorCount,
    deadline,
  };
}

export async function acceptEscrow(
  s: EscrowSetup,
  committer?: Keypair
): Promise<Keypair> {
  const c = committer ?? (await newFundedKeypair());
  await program.methods
    .accept()
    .accountsPartial({ committer: c.publicKey, escrow: s.escrow })
    .signers([c])
    .rpc();
  return c;
}

export async function submitEscrow(
  s: EscrowSetup,
  committer: Keypair,
  hash: number[] = Array(32).fill(7)
) {
  await program.methods
    .submit(hash)
    .accountsPartial({ committer: committer.publicKey, escrow: s.escrow })
    .signers([committer])
    .rpc();
}

export async function recordVerdict(
  s: EscrowSetup,
  outcome: "pass" | "fail",
  hash: number[] = Array(32).fill(9)
) {
  // anchor's generated enum type is a discriminated union; the ternary widens
  // it, so hand it over untyped (as the other test call sites do).
  const o: any = outcome === "pass" ? { pass: {} } : { fail: {} };
  await program.methods
    .recordVerdict(o, hash, s.world.moderator.publicKey)
    .accountsPartial({
      settlementAuthority: s.world.settlementAuthority.publicKey,
      config: s.world.config,
      escrow: s.escrow,
    })
    .signers([s.world.settlementAuthority])
    .rpc();
}

export { BN, SystemProgram, TOKEN_PROGRAM_ID, Keypair, PublicKey };
