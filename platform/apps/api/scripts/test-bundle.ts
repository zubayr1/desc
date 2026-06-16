/**
 * Deterministic checks for the deliverable bundling core (@repo/shared/bundle).
 * Run: `pnpm --filter api test:bundle`
 */
import assert from "node:assert/strict";
import { buildBundle } from "@repo/shared";

const enc = new TextEncoder();
const f = (path: string, content: string) => ({ path, content: enc.encode(content) });
const zeroSalt = new Uint8Array(16);

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("  ✓", name);
    passed++;
  } catch (e) {
    console.error("  ✗", name, "\n     ", (e as Error).message);
    process.exitCode = 1;
  }
}

const a = buildBundle([f("b.txt", "two"), f("a.txt", "one")], { salt: zeroSalt });
const b = buildBundle([f("a.txt", "one"), f("b.txt", "two")], { salt: zeroSalt });

check("root + deliverable_hash are independent of input order", () => {
  assert.equal(a.root, b.root);
  assert.equal(a.deliverableHash, b.deliverableHash);
});

check("accepted files come out path-sorted", () => {
  assert.deepEqual(
    a.accepted.map((x) => x.path),
    ["a.txt", "b.txt"]
  );
});

check("root is a 64-char hex sha256", () => {
  assert.match(a.root ?? "", /^[0-9a-f]{64}$/);
});

check("salt changes deliverable_hash but NOT the root", () => {
  const c = buildBundle([f("a.txt", "one"), f("b.txt", "two")], { salt: new Uint8Array(16).fill(7) });
  assert.equal(c.root, a.root);
  assert.notEqual(c.deliverableHash, a.deliverableHash);
});

check("different content → different root", () => {
  const c = buildBundle([f("a.txt", "one"), f("b.txt", "TWO")], { salt: zeroSalt });
  assert.notEqual(c.root, a.root);
});

const r = buildBundle(
  [f("../evil.sh", "x"), f("node_modules/lib.js", "x"), f(".env", "SECRET=1"), f("src/ok.js", "y")],
  { salt: zeroSalt }
);

check("rejects path traversal", () => assert.ok(r.rejected.some((x) => x.reason.includes("traversal"))));
check("rejects denylisted dir (node_modules)", () =>
  assert.ok(r.rejected.some((x) => x.reason.includes("denylisted directory"))));
check("rejects denylisted file (.env)", () =>
  assert.ok(r.rejected.some((x) => x.reason.includes("denylisted file"))));
check("keeps only the good file", () =>
  assert.deepEqual(
    r.accepted.map((x) => x.path),
    ["src/ok.js"]
  ));

check("duplicate path after normalization is rejected", () => {
  const c = buildBundle([f("./a.txt", "1"), f("a.txt", "2")], { salt: zeroSalt });
  assert.equal(c.accepted.length, 1);
  assert.ok(c.rejected.some((x) => x.reason.includes("duplicate")));
});

check("single file → ok", () => {
  const one = buildBundle([f("only.txt", "hello")], { salt: zeroSalt });
  assert.ok(one.ok);
  assert.match(one.root ?? "", /^[0-9a-f]{64}$/);
});

check("empty / all-rejected bundle → not ok", () => {
  assert.equal(buildBundle([], { salt: zeroSalt }).ok, false);
  assert.equal(buildBundle([f("node_modules/x", "1")], { salt: zeroSalt }).ok, false);
});

console.log(`\n${passed} checks passed`);
