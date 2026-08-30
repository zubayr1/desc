#!/usr/bin/env bash
#
# Run the Anchor suite one file at a time, each against its own fresh validator.
#
# Why: a single `anchor test` runs every file against one long-lived
# solana-test-validator, and on a constrained host that validator stops
# responding partway through — every test after it fails with "Blockhash not
# found" regardless of whether the code is correct. Restarting per file keeps
# each run well inside that limit.
#
#   ./run-tests.sh              # every test file
#   ./run-tests.sh refund       # only files matching "refund"
set -uo pipefail
cd "$(dirname "$0")"

filter="${1:-}"
failed=()

for f in tests/*.test.ts; do
  [[ -n "$filter" && "$f" != *"$filter"* ]] && continue
  echo ""
  echo "──────── $f"
  if ANCHOR_TEST_FILES="$f" anchor test; then
    echo "   PASS  $f"
  else
    echo "   FAIL  $f"
    failed+=("$f")
  fi
done

echo ""
if (( ${#failed[@]} )); then
  printf '%s failed:\n' "${#failed[@]}"
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
echo "all test files passed"
