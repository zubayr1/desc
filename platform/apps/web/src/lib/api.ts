import { Buffer } from "buffer";
import { Transaction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import type {
  Contract,
  CreateContractRequest,
  DeliverableUploadRequest,
} from "@repo/shared";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(body.error ?? body.message ?? `${res.status} ${res.statusText}`);
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

/** Create flow: POST /contracts returns { id, unsignedTx }; sign; then submit. */
export async function createAndFund(
  body: CreateContractRequest,
  signTransaction: Signer
): Promise<Contract> {
  const { id, unsignedTx } = await api.post<{ id: string; unsignedTx: string }>(
    "/contracts",
    body
  );
  const tx = Transaction.from(Buffer.from(unsignedTx, "base64"));
  const signed = await signTransaction(tx);
  return api.post<Contract>(`/contracts/${id}/submit`, {
    signedTx: signed.serialize().toString("base64"),
  });
}

/** Upload the encrypted deliverable bundle (server stores it blind). */
export const uploadDeliverable = (token: string, payload: DeliverableUploadRequest) =>
  api.post<{ ok: boolean; deliverableHash: string }>(
    `/links/${token}/deliverable/upload`,
    payload
  );
