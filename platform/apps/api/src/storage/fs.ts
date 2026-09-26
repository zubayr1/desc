import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "../config/env";

/**
 * Local-filesystem storage, under `STORAGE_DIR`.
 *
 * The right driver for development and for a box with a real disk. NOT for a
 * container platform: Render, Railway and Fly all give you an ephemeral
 * filesystem, so a restart would lose every deliverable and `mod-run` would
 * have nothing to judge. Use the `s3` driver there.
 */
const DIR = resolve(env.STORAGE_DIR);

export async function put(key: string, data: Uint8Array): Promise<void> {
  const full = join(DIR, key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function get(key: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(DIR, key)));
}

export async function exists(key: string): Promise<boolean> {
  try {
    await access(join(DIR, key));
    return true;
  } catch {
    return false;
  }
}
