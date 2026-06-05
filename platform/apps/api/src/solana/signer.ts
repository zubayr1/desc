import { readFileSync } from "node:fs";
import { Wallet } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { env, expandHome } from "../config/env";

/**
 * The settlement signer — the ONE key the api holds. Used only to sign
 * `record_verdict`.
 *
 * Today it's a local keypair file. To move signing into a KMS / HSM / Turnkey
 * later, replace the keypair load below with a custom `Wallet` implementation
 * whose `signTransaction` calls the remote signer. Nothing else in the api
 * changes — `program.ts` just consumes `settlementWallet`.
 */
const settlementKeypair = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(expandHome(env.SETTLEMENT_KEYPAIR_PATH), "utf8"))
  )
);

export const settlementWallet = new Wallet(settlementKeypair);
export const settlementPublicKey = settlementKeypair.publicKey;
