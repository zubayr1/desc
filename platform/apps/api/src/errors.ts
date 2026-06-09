import { ZodError } from "zod";

interface Humanized {
  status: number;
  message: string;
}

/**
 * Turn a thrown error (zod, tagged HTTP, or a Solana SendTransactionError) into a
 * clean client-facing message. Full detail still goes to the server logs — this
 * is only what the user sees.
 */
export function humanizeError(err: unknown): Humanized {
  // Validation
  if (err instanceof ZodError) {
    return { status: 400, message: err.issues.map((i) => i.message).join("; ") };
  }

  const e = err as {
    message?: string;
    statusCode?: number;
    transactionLogs?: string[];
  };

  // Our explicitly-tagged HTTP errors (e.g. 404 "contract not found")
  if (e?.statusCode && e.statusCode < 500) {
    return { status: e.statusCode, message: e.message || "Request failed." };
  }

  const msg = e?.message ?? "";
  const blob = `${msg} ${(e?.transactionLogs ?? []).join(" ")}`;

  // On-chain failures — most specific first
  if (blob.includes("found no record of a prior credit")) {
    return {
      status: 400,
      message: "This wallet has no SOL to pay the network fee. Fund it and try again.",
    };
  }
  if (blob.includes("insufficient funds")) {
    return {
      status: 400,
      message: "Insufficient USDC balance for this contract (amount + 2% fee).",
    };
  }
  if (blob.includes("AccountNotInitialized") && /\bmint\b/.test(blob)) {
    return {
      status: 400,
      message:
        "USDC mint not found on this cluster — re-bootstrap and update USDC_MINT in the api .env.",
    };
  }
  if (blob.includes("AccountNotInitialized")) {
    return {
      status: 400,
      message: "This wallet has no USDC account yet. Fund it with USDC and try again.",
    };
  }

  // Anchor program errors carry a human message: "… Error Message: <text>"
  const anchor = blob.match(/Error Message: ([^\n.]+)/);
  if (anchor) {
    return { status: 400, message: anchor[1].trim() };
  }

  // Any other chain simulation failure
  if (msg.includes("Simulation failed") || (e?.transactionLogs?.length ?? 0) > 0) {
    return {
      status: 400,
      message: "On-chain transaction failed. Check your SOL and USDC balances and try again.",
    };
  }

  return { status: 500, message: "Something went wrong. Please try again." };
}
