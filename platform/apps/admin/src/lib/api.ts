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
