#!/usr/bin/env bash
#
# Fund the localnet test wallets: SOL (fees/rent) + a USDC token account minted full.
# The USDC mint comes from `pnpm bootstrap` and is passed as the first argument.
#
#   ./fund-wallets.sh <USDC_MINT> [amount]
#
# - <USDC_MINT>  (required) the dev mint printed by bootstrap
# - [amount]     (optional) USDC to mint per wallet (default 1_000_000)
#
# The deployer keypair (~/.config/solana/id.json) is the fee payer AND mint
# authority. spl-token needs --fee-payer explicitly (it ignores `solana config`
# once --url is set). Re-runnable: a pre-existing token account is not an error.
set -uo pipefail

USDC_MINT="${1:-}"
AMOUNT="${2:-1000000}"
if [[ -z "$USDC_MINT" ]]; then
  echo "usage: ./fund-wallets.sh <USDC_MINT> [amount]" >&2
  exit 1
fi

FEE_PAYER="$HOME/.config/solana/id.json"
URL="localhost"
SOL=2

WALLETS=(
  tvewhNeSPrqRXRMGSiKRdRZVo2yHjHBHLhfL2QfkUav
  DYD14Q9hked8pWxFHPLpJdTcXpSX4S4in9FYd82nnfFE
)

for w in "${WALLETS[@]}"; do
  echo "== funding $w =="
  solana airdrop "$SOL" "$w" -u "$URL" || echo "  (airdrop skipped — already funded?)"
  spl-token create-account "$USDC_MINT" --owner "$w" \
    --fee-payer "$FEE_PAYER" --url "$URL" 2>/dev/null \
    || echo "  (token account already exists)"
  spl-token mint "$USDC_MINT" "$AMOUNT" --recipient-owner "$w" \
    --fee-payer "$FEE_PAYER" --url "$URL"
  echo "  SOL : $(solana balance "$w" -u "$URL")"
  echo "  USDC: $(spl-token balance "$USDC_MINT" --owner "$w" --url "$URL" 2>/dev/null || echo '?')"
  echo
done

echo "done."
