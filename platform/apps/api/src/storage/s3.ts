import { AwsClient } from "aws4fetch";
import { env } from "../config/env";

/**
 * S3-compatible object storage.
 *
 * Deliberately the S3 *API* rather than any one provider's SDK: the same code
 * runs on Cloudflare R2, AWS S3, Backblaze B2 and MinIO, so moving provider is
 * four environment variables and no deployment is a one-way door. R2 is the
 * cheap default — 10 GB free and, unlike S3, no egress charges, which matters
 * because every moderator downloads every bundle it judges.
 *
 * `aws4fetch` is used over `@aws-sdk/client-s3` for the same reason it is used
 * everywhere else: it is a few KB of SigV4 over `fetch`, against the AWS SDK's
 * several MB, and we need exactly three verbs.
 */
const client = new AwsClient({
  accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
  secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
  service: "s3",
  // R2 ignores the region but SigV4 still has to sign one.
  region: env.S3_REGION,
});

/** `<endpoint>/<bucket>/<key>`, with each key segment escaped. */
const url = (key: string) =>
  `${env.S3_ENDPOINT?.replace(/\/+$/, "")}/${env.S3_BUCKET}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

export async function put(key: string, data: Uint8Array): Promise<void> {
  // A plain ArrayBuffer, because a `Uint8Array` can be a view into a larger or
  // shared buffer and does not satisfy fetch's body type.
  const body = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
  const res = await client.fetch(url(key), {
    method: "PUT",
    body,
    headers: { "content-type": "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error(`storage put ${key} failed: ${res.status} ${await res.text()}`);
  }
}

export async function get(key: string): Promise<Uint8Array> {
  const res = await client.fetch(url(key));
  if (!res.ok) {
    throw new Error(`storage get ${key} failed: ${res.status} ${await res.text()}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function exists(key: string): Promise<boolean> {
  const res = await client.fetch(url(key), { method: "HEAD" });
  if (res.ok) return true;
  if (res.status === 404) return false;
  throw new Error(`storage head ${key} failed: ${res.status}`);
}
