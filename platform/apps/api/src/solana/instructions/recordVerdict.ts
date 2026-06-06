import { PublicKey } from "@solana/web3.js";
import type { Outcome } from "@repo/shared";
import { program, platformConfigPda, settlementPublicKey } from "../program";

export interface SendRecordVerdictParams {
  escrow: PublicKey;
  outcome: Outcome;
  verdictHashBytes: number[]; // [u8; 32]
}

/**
 * Build, sign (with the hot settlement key, via the provider), and send
 * `record_verdict`. Unlike user flows this is NOT an unsigned-tx builder — the
 * API is the signer here. Returns the tx signature.
 */
export async function sendRecordVerdict(
  p: SendRecordVerdictParams
): Promise<string> {
  const outcomeArg = p.outcome === "pass" ? { pass: {} } : { fail: {} };

  return program.methods
    .recordVerdict(outcomeArg, p.verdictHashBytes)
    .accountsPartial({
      settlementAuthority: settlementPublicKey,
      config: platformConfigPda,
      escrow: p.escrow,
    })
    .rpc();
}
