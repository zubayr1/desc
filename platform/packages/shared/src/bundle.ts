/**
 * Deterministic deliverable bundling — validation + Merkle root.
 *
 * Pure & isomorphic (same result in the browser and Node via @noble/hashes), so
 * the web can compute a bundle and the api can re-verify it byte-for-byte. No
 * encryption, no storage, no chain here — just: clean file set in → deterministic
 * `root` + `manifest` out. See docs/deliverable-mechanism.md.
 */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, randomBytes } from "@noble/hashes/utils";

export const BUNDLE_LIMITS = {
  maxFiles: 5000,
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  maxTotalSize: 100 * 1024 * 1024, // 100 MB
};

const DENY_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  ".venv",
  "__pycache__",
  ".cache",
  "vendor",
];
const DENY_FILE_EXACT = new Set([".env", ".DS_Store", "Thumbs.db", "id_rsa", "id_dsa"]);
const DENY_FILE_RE = [/^\.env(\..+)?$/, /\.pem$/i, /\.key$/i];

export interface InputFile {
  path: string;
  content: Uint8Array;
}
export interface ManifestFile {
  path: string;
  size: number;
  hash: string; // hex sha256 leaf hash for this file
}
export interface RejectedFile {
  path: string;
  reason: string;
}
export interface Manifest {
  v: 1;
  algo: "sha256";
  root: string; // R_plain (Merkle root), hex
  files: ManifestFile[]; // canonical (path-sorted) order
  salt: string; // hex, 16 random bytes → per-submission uniqueness
}
export interface BundleResult {
  ok: boolean;
  root: string | null;
  deliverableHash: string | null; // sha256(canonical manifest), hex → the on-chain anchor
  manifest: Manifest | null;
  accepted: ManifestFile[];
  rejected: RejectedFile[];
  totalSize: number;
  /** Canonical plaintext bundle to encrypt: JSON `{manifest, files:[{path,contentBase64}]}`.
   *  Only produced when `withBlob` is set (the committer's browser needs it). */
  blob: Uint8Array | null;
}

/** Parsed shape of the plaintext blob (after a moderator decrypts it). */
export interface BundleBlob {
  manifest: Manifest;
  files: { path: string; contentBase64: string }[];
}

const enc = new TextEncoder();
const LEAF = Uint8Array.of(0x00);
const NODE = Uint8Array.of(0x01);

/** 8-byte big-endian length prefix. */
function u64be(n: number): Uint8Array {
  const b = new Uint8Array(8);
  let v = BigInt(n);
  for (let i = 7; i >= 0; i--) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

function normalizePath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .normalize("NFC");
}

/** Returns a rejection reason, or null if the path is acceptable. */
function rejectReason(normalized: string, original: string): string | null {
  if (original.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(original)) return "absolute path";
  if (normalized === "" || normalized === ".") return "empty path";
  const segs = normalized.split("/");
  if (segs.some((s) => s === "..")) return "path traversal (..)";
  if ([...normalized].some((ch) => ch.charCodeAt(0) < 0x20)) return "control characters in path";
  const denyDir = segs.find((s) => DENY_DIRS.includes(s));
  if (denyDir) return `denylisted directory (${denyDir})`;
  const base = segs[segs.length - 1];
  if (DENY_FILE_EXACT.has(base) || DENY_FILE_RE.some((re) => re.test(base))) {
    return `denylisted file (${base})`;
  }
  return null;
}

/** Byte-wise compare (deterministic across locales, unlike string `<`). */
function cmpBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** Chunked base64 (isomorphic: btoa exists in browsers and Node ≥16). */
function b64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function leafHash(pathBytes: Uint8Array, content: Uint8Array): Uint8Array {
  return sha256(
    concatBytes(LEAF, u64be(pathBytes.length), pathBytes, u64be(content.length), content)
  );
}

function merkleRoot(leaves: Uint8Array[]): Uint8Array {
  let level = leaves;
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      // pair (node tag 0x01) or promote the odd tail unchanged
      next.push(i + 1 < level.length ? sha256(concatBytes(NODE, level[i], level[i + 1])) : level[i]);
    }
    level = next;
  }
  return level[0];
}

/** Canonical manifest serialization. Deterministic given fixed key order + sorted
 *  files. (Production: prefer canonical CBOR; JSON is fine for the MVP.) */
function canonicalManifest(m: Manifest): string {
  return JSON.stringify(m);
}

/**
 * Validate + clean an input file set, then build the deterministic Merkle root and
 * manifest. Returns accepted/rejected for display; `ok` is false (root/manifest
 * null) if there are no acceptable files or a global cap is exceeded.
 */
export function buildBundle(
  files: InputFile[],
  opts?: { salt?: Uint8Array; withBlob?: boolean }
): BundleResult {
  const kept: { path: string; pathBytes: Uint8Array; content: Uint8Array }[] = [];
  const rejected: RejectedFile[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    const p = normalizePath(f.path);
    const reason = rejectReason(p, f.path);
    if (reason) {
      rejected.push({ path: f.path, reason });
      continue;
    }
    if (seen.has(p)) {
      rejected.push({ path: p, reason: "duplicate path after normalization" });
      continue;
    }
    if (f.content.length > BUNDLE_LIMITS.maxFileSize) {
      rejected.push({ path: p, reason: "file exceeds size cap" });
      continue;
    }
    seen.add(p);
    kept.push({ path: p, pathBytes: enc.encode(p), content: f.content });
  }

  kept.sort((a, b) => cmpBytes(a.pathBytes, b.pathBytes));
  const totalSize = kept.reduce((s, k) => s + k.content.length, 0);

  const fail = (extra: string): BundleResult => ({
    ok: false,
    root: null,
    deliverableHash: null,
    manifest: null,
    accepted: kept.map((k) => ({ path: k.path, size: k.content.length, hash: "" })),
    rejected: [...rejected, { path: "(bundle)", reason: extra }],
    totalSize,
    blob: null,
  });

  if (kept.length === 0) return fail("no acceptable files");
  if (kept.length > BUNDLE_LIMITS.maxFiles) return fail("too many files");
  if (totalSize > BUNDLE_LIMITS.maxTotalSize) return fail("total size exceeds cap");

  const leaves = kept.map((k) => leafHash(k.pathBytes, k.content));
  const root = bytesToHex(merkleRoot(leaves));
  const accepted: ManifestFile[] = kept.map((k, i) => ({
    path: k.path,
    size: k.content.length,
    hash: bytesToHex(leaves[i]),
  }));

  const salt = opts?.salt ?? randomBytes(16);
  const manifest: Manifest = { v: 1, algo: "sha256", root, files: accepted, salt: bytesToHex(salt) };
  const deliverableHash = bytesToHex(sha256(enc.encode(canonicalManifest(manifest))));

  const blob = opts?.withBlob
    ? enc.encode(
        JSON.stringify({
          manifest,
          files: kept.map((k) => ({ path: k.path, contentBase64: b64(k.content) })),
        })
      )
    : null;

  return { ok: true, root, deliverableHash, manifest, accepted, rejected, totalSize, blob };
}
