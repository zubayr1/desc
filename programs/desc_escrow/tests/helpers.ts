import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { DescEscrow } from "../target/types/desc_escrow";
import { DescModeration } from "../../desc_moderation/target/types/desc_moderation";
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

// desc_moderation lives in a sibling workspace, so it is not on
// `anchor.workspace` — build its client from its IDL. The program itself is
// loaded onto the test validator via `[[test.genesis]]` in Anchor.toml.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const moderationIdl = require("../../desc_moderation/target/idl/desc_moderation.json");
export const moderation = new Program<DescModeration>(moderationIdl, provider);
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

export function moderationConfigPda(admin: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), admin.toBuffer()],
    moderation.programId
  )[0];
}

/** `[b"authority", moderation_config]` — the escrow's settlement authority. */
export function verdictAuthorityPda(modConfig: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("authority"), modConfig.toBuffer()],
    moderation.programId
  )[0];
}

export function moderatorPda(wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("moderator"), wallet.toBuffer()],
    moderation.programId
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
  /** The `desc_moderation` verdict-authority PDA — a real PDA, not a keypair, so
   *  only a registered moderator can settle, by CPI. */
  settlementAuthority: PublicKey;
  /** This world's `desc_moderation` config (admin = `authority`). */
  modConfig: PublicKey;
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
  /** The world's registered moderator: assigned at `create_escrow`, signs
   *  `submit_verdict`, and receives the surcharge on settle. */
  moderator: Keypair;
  moderatorPda: PublicKey;
  moderatorAta: PublicKey;
  /** The moderator's own price, in bps of the contract amount. */
  modBps: number;
}

export async function setupWorld(
  feeBps = 200,
  feeMin = 0,
  minAmount = 0,
  modBps = 100
): Promise<World> {
  const authority = await newFundedKeypair();

  // The moderation side: its config, whose verdict PDA becomes the escrow's
  // settlement authority — exactly how `bootstrap` wires production.
  const modConfig = moderationConfigPda(authority.publicKey);
  const settlementAuthority = verdictAuthorityPda(modConfig);
  await moderation.methods
    .initialize(program.programId, 1)
    .accountsPartial({
      admin: authority.publicKey,
      config: modConfig,
      authority: settlementAuthority,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

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
  const moderator = await newFundedKeypair(1); // signs submit_verdict
  const moderatorAta = await fundedAta(
    mintAuthority,
    mint,
    moderator.publicKey,
    0,
    mintAuthority
  );

  await program.methods
    .initializeConfig(
      settlementAuthority,
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

  const moderatorPdaKey = await registerModeratorIn(authority, modConfig, moderator, modBps);

  return {
    authority,
    settlementAuthority,
    modConfig,
    moderatorPda: moderatorPdaKey,
    modBps,
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

/** Register `wallet` as a moderator under `modConfig` with its own price. */
async function registerModeratorIn(
  admin: Keypair,
  modConfig: PublicKey,
  wallet: Keypair,
  baseBps: number,
  feePerKb = 0,
  maxBundleKb = 0
): Promise<PublicKey> {
  const pda = moderatorPda(wallet.publicKey);
  await moderation.methods
    .registerModerator(
      wallet.publicKey,
      "age1testrecipient",
      "Test Mod",
      baseBps,
      new BN(feePerKb),
      maxBundleKb
    )
    .accountsPartial({
      admin: admin.publicKey,
      config: modConfig,
      moderator: pda,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();
  return pda;
}

/** An extra moderator in `world` — e.g. to prove only the ASSIGNED one may judge. */
export async function addModerator(
  world: World,
  opts?: { baseBps?: number; feePerKb?: number; maxBundleKb?: number }
): Promise<{ wallet: Keypair; pda: PublicKey }> {
  const wallet = await newFundedKeypair(1);
  const pda = await registerModeratorIn(
    world.authority,
    world.modConfig,
    wallet,
    opts?.baseBps ?? world.modBps,
    opts?.feePerKb ?? 0,
    opts?.maxBundleKb ?? 0
  );
  return { wallet, pda };
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

/**
 * Block until the validator's clock has passed `ts`.
 *
 * The local validator only advances slots when there is something to put in a
 * block, and `Clock::unix_timestamp` moves with the slot — so a loop that only
 * *reads* the clock can wait forever while the chain sits still. Each iteration
 * therefore sends a throwaway airdrop to force a block.
 */
export async function waitForChainTime(ts: number, timeoutMs = 120_000) {
  const started = Date.now();
  while ((await chainUnixTs()) <= ts) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`chain clock did not reach ${ts} within ${timeoutMs}ms`);
    }
    try {
      await connection.requestAirdrop(Keypair.generate().publicKey, 1_000);
    } catch {
      // the faucet refusing is fine — we only wanted the block it produces
    }
    await sleep(400);
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
  noMod: boolean;
}

let labelCounter = 0;

export async function createEscrow(opts?: {
  world?: World;
  amount?: BN;
  /** Override the Moderator account passed to create_escrow. Defaults to the
   *  world's moderator (or none for no-mod). `null` passes no account. */
  moderator?: PublicKey | null;
  deadlineOffset?: number;
  /** Absolute deadline in CHAIN time. Use with `chainUnixTs()` for deadline
   *  tests; `deadlineOffset` is wall-relative and only safe for far futures. */
  deadlineAbsolute?: number;
  /** Initiator opts out of moderation — no moderator account, no surcharge. */
  noMod?: boolean;
}): Promise<EscrowSetup> {
  const world = opts?.world ?? (await setupWorld());
  const amount = opts?.amount ?? usdc(1000);
  const noMod = opts?.noMod ?? false;
  const moderatorAccount =
    opts?.moderator !== undefined ? opts.moderator : noMod ? null : world.moderatorPda;
  // Mirrors the program: the surcharge is the moderator's own price.
  const surcharge = noMod
    ? usdc(0)
    : amount.mul(new BN(world.modBps)).div(new BN(10_000));
  const moderatorCount = noMod ? 0 : 1;
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
    .createEscrow(cid, amount, deadline, noMod)
    .accountsPartial({
      initiator: initiator.publicKey,
      config: world.config,
      mint: world.mint,
      escrow,
      vault,
      initiatorTokenAccount: initiatorAta,
      moderator: moderatorAccount,
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
    noMod,
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

/**
 * Record a verdict the way production does: a registered moderator signs
 * `desc_moderation::submit_verdict`, which CPIs into escrow's `record_verdict`
 * as the verdict-authority PDA. Defaults to the world's (assigned) moderator.
 */
export async function recordVerdict(
  s: EscrowSetup,
  outcome: "pass" | "fail",
  hash: number[] = Array(32).fill(9),
  by: Keypair = s.world.moderator
) {
  // anchor's generated enum type is a discriminated union; the ternary widens
  // it, so hand it over untyped (as the other test call sites do).
  const o: any = outcome === "pass" ? { pass: {} } : { fail: {} };
  await moderation.methods
    .submitVerdict(o, hash)
    .accountsPartial({
      authority: by.publicKey,
      config: s.world.modConfig,
      verdictAuthority: s.world.settlementAuthority,
      moderator: moderatorPda(by.publicKey),
      escrowConfig: s.world.config,
      escrow: s.escrow,
      descEscrowProgram: program.programId,
    })
    .signers([by])
    .rpc();
}

export { BN, SystemProgram, TOKEN_PROGRAM_ID, Keypair, PublicKey };
