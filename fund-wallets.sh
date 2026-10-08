#!/usr/bin/env bash
#
# Fund test wallets: SOL (fees/rent) + a USDC token account minted full.
# The USDC mint comes from `pnpm bootstrap` and is passed as the first argument.
#
#   ./fund-wallets.sh <USDC_MINT> [amount]
#   SOLANA_URL=devnet WALLETS="<pubkey>" ./fund-wallets.sh <USDC_MINT> 1000
#   ./fund-wallets.sh --tiebreakers   SOL only, for the wallets `pnpm tiebreaker-register` wrote
#
# - <USDC_MINT>  (required) the dev mint printed by bootstrap
# - [amount]     (optional) USDC to mint per wallet (default 1_000_000)
# - SOLANA_URL   (optional) cluster: localhost (default) | devnet
# - WALLETS      (optional) space-separated pubkeys, replacing the defaults.
#                Use this for a browser wallet when testing a deployment —
#                the built-in two only exist on the local validator.
#
# The deployer keypair (~/.config/solana/id.json) is the fee payer AND mint
# authority. spl-token needs --fee-payer explicitly (it ignores `solana config`
# once --url is set). Re-runnable: a pre-existing token account is not an error.
set -uo pipefail

if [[ "${1:-}" == "--tiebreakers" ]]; then
  DIR="${MOD_DIR:-$(dirname "$0")/platform/apps/api/moderators}"
  URL="${SOLANA_URL:-localhost}"
  shopt -s nullglob
  files=("$DIR"/tiebreaker-*-wallet.json)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "no tiebreaker wallets in $DIR — run \`pnpm tiebreaker-register\` first" >&2
    exit 1
  fi
  for f in "${files[@]}"; do
    w=$(solana-keygen pubkey "$f")
    solana airdrop "${SOL_PER_WALLET:-1}" "$w" -u "$URL" >/dev/null || echo "  (airdrop refused for $w)"
    echo "$(basename "$f" -wallet.json)  $w  $(solana balance "$w" -u "$URL")"
  done
  exit 0
fi

USDC_MINT="${1:-}"
AMOUNT="${2:-1000000}"
if [[ -z "$USDC_MINT" ]]; then
  echo "usage: ./fund-wallets.sh <USDC_MINT> [amount]" >&2
  exit 1
fi

FEE_PAYER="$HOME/.config/solana/id.json"
URL="${SOLANA_URL:-localhost}"
# A local validator's faucet is endless; devnet's is rate-limited and shared,
# so ask it for far less and expect a refusal now and then.
if [[ -n "${SOL_PER_WALLET:-}" ]]; then SOL="$SOL_PER_WALLET"
elif [[ "$URL" == "localhost" ]]; then SOL=2
else SOL=0.2
fi

if [[ -n "${WALLETS:-}" ]]; then
  read -r -a WALLETS <<< "$WALLETS"
else
  WALLETS=(
    tvewhNeSPrqRXRMGSiKRdRZVo2yHjHBHLhfL2QfkUav
    DYD14Q9hked8pWxFHPLpJdTcXpSX4S4in9FYd82nnfFE
  )
fi

echo "cluster: $URL · mint: $USDC_MINT · ${#WALLETS[@]} wallet(s)"
echo

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
