/**
 * Where deliverable bundles live — the ciphertext a moderator downloads to
 * judge, keyed by its content hash.
 *
 * One interface, two drivers, chosen by `STORAGE_DRIVER`:
 *   fs  — the local filesystem (development, or a server with a real disk)
 *   s3  — any S3-compatible store (R2, S3, B2, MinIO)
 *
 * Nothing above this module knows which is in use, which is the point: the
 * deliverable path is the one piece of the platform that cannot be stateless,
 * and it should not be the reason a deployment target is hard to change.
 */
import { env } from "../config/env";
import * as fs from "./fs";
import * as s3 from "./s3";

const driver = env.STORAGE_DRIVER === "s3" ? s3 : fs;

export const put = driver.put;
export const get = driver.get;
export const exists = driver.exists;

/** For logs and `/health` — which store the deliverables are actually in. */
export const describe = (): string =>
  env.STORAGE_DRIVER === "s3" ? `s3 (${env.S3_BUCKET})` : `fs (${env.STORAGE_DIR})`;
