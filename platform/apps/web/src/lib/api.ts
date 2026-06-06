import { Buffer } from "buffer";
import { Transaction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
};

type Signer = NonNullable<WalletContextState["signTransaction"]>;

/**
 * The Model-B dance: ask the API to build an unsigned tx, have the wallet sign
 * it, send it back to the API to submit + confirm.
 */
export async function prepareSignSubmit<T>(
  preparePath: string,
  submitPath: string,
  body: unknown,
  signTransaction: Signer
): Promise<T> {
  const { unsignedTx } = await api.post<{ unsignedTx: string }>(
    preparePath,
    body
  );
  const tx = Transaction.from(Buffer.from(unsignedTx, "base64"));
  const signed = await signTransaction(tx);
  const signedTx = signed.serialize().toString("base64");
  return api.post<T>(submitPath, { signedTx });
}
