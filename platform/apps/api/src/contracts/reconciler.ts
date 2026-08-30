import { reconcileRows } from "./read";
import { getRows } from "./repo";

/**
 * Background reconciler.
 *
 * The read model is written through on every flow the api drives, but the api
 * is not the only writer: escrow instructions are user-signed and the PDAs are
 * derivable, so either party can settle straight from a wallet, and `mod-run`
 * records verdicts without touching the api at all. Those changes were only
 * noticed when somebody happened to load the list view.
 *
 * This sweeps every non-terminal contract on an interval and writes back any
 * drift, so the dashboard is correct whether or not anyone is looking at it.
 *
 * Fail-safe by design: an unreachable RPC logs and returns: the cached columns
 * stay as they were and the next tick tries again.
 */
export interface Reconciler {
  stop: () => void;
}

export function startReconciler(opts: {
  intervalMs: number;
  log: { info: (o: unknown, msg?: string) => void; warn: (o: unknown, msg?: string) => void };
}): Reconciler {
  let running = false;

  const tick = async () => {
    // Skip if the previous sweep is still going — a slow RPC must not stack up.
    if (running) return;
    running = true;
    try {
      const rows = await getRows({});
      const { updated } = await reconcileRows(rows);
      if (updated) opts.log.info({ updated }, "reconciler: wrote back chain drift");
    } catch (err) {
      opts.log.warn({ err }, "reconciler: sweep failed, will retry");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, opts.intervalMs);
  // Don't hold the process open on shutdown.
  timer.unref?.();
  void tick(); // one sweep at boot so a restart catches anything missed while down

  return { stop: () => clearInterval(timer) };
}
