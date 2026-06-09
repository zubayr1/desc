# desc platform — dev runbook

Monorepo for the off-chain side of desc.

```
apps/
  api/      backend (Fastify) — owns the DB, builds/submits txns, signs verdicts
  web/      user frontend (Vite + React) — create / dashboard / contract detail
  admin/    dispute-review tool (later)
packages/
  shared/   shared TS domain + API types
services/
  ai/       Helper AI + moderator agents (later)
```

The on-chain program lives outside this monorepo at `../programs/desc_escrow`.

---

## Prerequisites

- Node + `pnpm`, Rust + `anchor` + `solana` CLI, Docker
- A browser wallet (Phantom) pointed at the **local** validator (see below)
- `pnpm install` once at the repo root

---

## Start everything (in order)

A **fresh validator** has no program/Config/mint, so steps 2–4 must run after every
`anchor localnet` restart. Each block is its own terminal.

### 1. Postgres
```bash
cd platform
docker compose up -d
```
> Host port defaults to 5432. If that's taken, set `POSTGRES_PORT=5433` in
> `platform/.env` (already done on this machine) and use that port in `DATABASE_URL`.

### 2. Validator + program (keep running)
```bash
cd programs/desc_escrow
anchor localnet
```

### 3. Bootstrap the chain (Config + dev USDC mint)
```bash
cd platform/apps/api
pnpm bootstrap
```
Copy the printed values into **`apps/api/.env`**, then **restart the api** (`.env` is
read once at startup):
```
CONFIG_AUTHORITY=...
SETTLEMENT_KEYPAIR_PATH=./settlement-keypair.json
USDC_MINT=...
```
Re-running `pnpm bootstrap` on an existing Config just reprints these (incl. the
current `USDC_MINT`) and tops up the keys.

### 4. Apply the DB schema
```bash
# in apps/api
pnpm db:push
```

### 5. API
```bash
# in apps/api
pnpm dev            # → http://localhost:3000
```

### 6. Web
```bash
cd platform/apps/web
pnpm dev            # → http://localhost:5173
```

### Dependency order at a glance
```
docker compose up → anchor localnet → pnpm bootstrap (edit .env, restart api)
                                    → pnpm db:push
                                    → api  pnpm dev
                                    → web  pnpm dev
```

---

## Reset local state (keep validator ↔ DB in sync)

Restarting `anchor localnet` gives a **fresh chain** (no escrows), but Postgres
**persists** — so the dashboard would show stale contracts pointing at accounts
that no longer exist. After a validator restart, clear the DB so the two stay in
sync:

```bash
# wipe contract rows (keeps the schema)
docker exec platform-postgres-1 psql -U desc -d desc -c "truncate contracts;"
```

Full reset (also drops the Postgres volume):
```bash
cd platform
docker compose down -v && docker compose up -d
pnpm --filter api db:push          # recreate the schema
```

> Localnet/devnet only. On mainnet the chain is never wiped, so the DB (off-chain
> metadata) and chain stay naturally in sync — you never truncate there.

---

## Point Phantom at localnet

Phantom simulates against whatever cluster it's set to, so it **must** target the
local validator:

> Phantom → Settings → Developer Settings → **Change Network** → custom RPC
> `http://localhost:8899`

---

## Fund test wallets

There is no in-app faucet — fund wallets yourself. The mint authority is your
default Solana keypair (`~/.config/solana/id.json`, the deployer that ran bootstrap).

| Wallet | Needs |
|---|---|
| **Initiator** (creates a contract) | SOL (fees + rent) **and** USDC (the escrow amount + 2% fee) |
| **Committer** (accepts / submits / claims) | **SOL only** |

```bash
# SOL (both wallets)
solana airdrop 2 <WALLET> -u localhost

# USDC (initiator only) — create the token account once, then mint
# NOTE: spl-token needs --fee-payer explicitly (it ignores `solana config` when --url is set)
spl-token create-account <USDC_MINT> --owner <WALLET> \
  --fee-payer ~/.config/solana/id.json --url localhost
spl-token mint <USDC_MINT> 1000000 --recipient-owner <WALLET> \
  --fee-payer ~/.config/solana/id.json --url localhost
```
`<USDC_MINT>` is the value from `pnpm bootstrap`. `1000000` = 1,000,000 USDC (plenty).
`~/.config/solana/id.json` is the deployer = fee payer **and** mint authority.

---

## Record a verdict (settlement authority)

`record_verdict` is **signed by the api** (the settlement key in
`settlement-keypair.json`), not by a wallet. The admin UI isn't built yet, so trigger
it directly. The contract must be in **`submitted`** state first.

```bash
# PASS → unlocks "Release" on the contract page
curl -X POST localhost:3000/admin/contracts/<CONTRACT_ID>/verdict \
  -H 'content-type: application/json' -d '{"outcome":"pass"}'

# FAIL → unlocks "Reclaim deposit" for the initiator
curl -X POST localhost:3000/admin/contracts/<CONTRACT_ID>/verdict \
  -H 'content-type: application/json' -d '{"outcome":"fail","note":"criteria not met"}'
```
`<CONTRACT_ID>` is the contract **uuid** — from the `/contracts/<uuid>` URL or the
dashboard. It is **not** the `/c/<token>` link token. To get the uuid from a link token:
```bash
curl -s localhost:3000/links/<token> | jq -r .id
```
The api signs + submits the verdict; refresh the contract page to see the new action.

---

## Full lifecycle walkthrough (UI + one curl)

1. **Create** (wallet A, funded with SOL + USDC) → contract is `funded`, shows a link.
2. Open the **link** (`/c/<token>`) with **wallet B** (funded with SOL, ≠ A) → **Accept** → `active`.
3. As wallet B → **Submit deliverable** (paste a URL) → `submitted`.
4. **Record verdict** via the curl above (`pass`).
5. Refresh → **Release** → `settled`. ✅

---

## Ports

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:3000 |
| Validator RPC | http://localhost:8899 |
| Postgres | localhost:5433 (or `POSTGRES_PORT`) |

See `apps/api/scripts/README.md` for the operator scripts (`bootstrap`, `update-config`, e2e).
