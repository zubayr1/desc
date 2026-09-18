import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_MIN_AMOUNT,
  DEFAULT_PROTOCOL_FEE_BPS,
  DEFAULT_PROTOCOL_FEE_MIN,
  type FeeConfig,
} from "@repo/shared";
import { getFeeConfig } from "./api";

/**
 * Live fee parameters from the chain (via `GET /config/fees`). Until it answers
 * the protocol numbers fall back to the shared defaults — but moderators do
 * NOT: a moderator's price is its own, and inventing one would quote a number
 * no wallet is ever asked to sign.
 */
export function useFees() {
  const q = useQuery({ queryKey: ["feeConfig"], queryFn: getFeeConfig, staleTime: 5 * 60 * 1000 });
  const fees: FeeConfig = q.data ?? {
    protocolFeeBps: DEFAULT_PROTOCOL_FEE_BPS,
    protocolFeeMin: String(DEFAULT_PROTOCOL_FEE_MIN),
    minAmount: String(DEFAULT_MIN_AMOUNT),
    moderators: [],
  };
  const cheapestBps = fees.moderators.length
    ? Math.min(...fees.moderators.map((m) => m.baseBps))
    : undefined;
  return {
    fees,
    loaded: q.isSuccess,
    protocolPct: fees.protocolFeeBps / 100,
    feeFloor: Number(fees.protocolFeeMin) / 1e6,
    minContract: Number(fees.minAmount) / 1e6,
    /** Cheapest active moderator, in % — undefined if none is registered yet. */
    cheapestModPct: cheapestBps === undefined ? undefined : cheapestBps / 100,
  };
}
