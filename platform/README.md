# desc platform — dev runbook

Monorepo for the off-chain side of desc.

```
apps/
  api/      backend (Fastify) — owns the DB, builds/submits txns; blind (stores sealed deliverables, can't decrypt)
  web/      user frontend (Vite + React) — create / dashboard / contract detail
  admin/    platform oversight (read-only) — all contracts + statuses; does NOT judge
packages/
  shared/   shared TS domain + API types
services/
  ai/       Helper AI + moderator runner (later)
```

On-chain programs live outside this monorepo under `../programs`:
- `desc_escrow` — USDC escrow + lifecycle (Config, create / accept / submit / record_verdict / release / refund).
- `desc_moderation` — moderator registry + verdict authority: mods are PDAs with their own non-custodial wallets that sign verdicts via CPI into `desc_escrow` — **no settlement keypair** (the api holds no signing key). The escrow's `settlement_authority` is this program's verdict PDA. See "Moderation program" below.

---

## Prerequisites

- Node + `pnpm`, Rust + `anchor` + `solana` CLI, Docker
- A browser wallet (Phantom) pointed at the **local** validator (see below)
- `pnpm install` once at the repo root

---

## Start everything (in order)

A **fresh validator** has no program/Config/mint, so steps 2–5 must run after every
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

### 3. Deploy the program (after any Rust change)
```bash
# from the repo root, in a NEW terminal — step 2 keeps running
cd programs/desc_escrow
solana program deploy target/deploy/desc_escrow.so \
  --program-id target/deploy/desc_escrow-keypair.json \
  --use-rpc -u localhost
```
`anchor localnet` only loads programs at **genesis**, and genesis happens only on a
*fresh* ledger. Restart it against an existing `test-ledger` and it silently keeps
running the **old** binary — your Rust changes never reach the chain. Worse, Anchor's
borsh ignores trailing bytes, so a call with a newly-added argument still succeeds and
the argument is quietly dropped.

So deploy explicitly whenever the program changed. `--use-rpc` is required: the default
TPU path panics against the test validator with "Failed to get slot leaders".

Confirm it took:
```bash
solana program dump <PROGRAM_ID> /tmp/deployed.so -u localhost
ls -l /tmp/deployed.so target/deploy/desc_escrow.so   # sizes should match
```
> This upgrades **in place** — Config, mint, wallets and existing escrows all survive.
> Only reset the ledger when you actually want a clean slate (see *Reset local state*).

### 4. Bootstrap the chain (Config + dev USDC mint)
```bash
cd platform/apps/api
pnpm bootstrap
```
Copy the printed values into **`apps/api/.env`**, then **restart the api** (`.env` is
read once at startup):
```
CONFIG_AUTHORITY=...
USDC_MINT=...
```
`bootstrap` sets the escrow's `settlement_authority` to the **`desc_moderation` verdict
PDA** (no hot key — the api holds no signing key). Re-running on an existing Config just
reprints these (incl. the current `USDC_MINT`).

### 5. Apply the DB schema
```bash
# in apps/api
pnpm db:push
```

### 6. API
```bash
# in apps/api
pnpm dev            # → http://localhost:3000
```

### 7. Web
```bash
cd platform/apps/web
pnpm dev            # → http://localhost:5173
```

### Dependency order at a glance
```
docker compose up → anchor localnet → solana program deploy → pnpm bootstrap
                                                                (edit .env, restart api)
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

## Moderation program (`desc_moderation`) — one-time setup

The on-chain moderator program at `../programs/desc_moderation`. Mods sign verdicts
with their **own non-custodial wallets**; there is **no settlement keypair**. Do this
**before** recording any verdict (the next section).

- **States:** `ModerationConfig [b"config", admin]`, `Moderator [b"moderator", authority]`
  (the mod's wallet + its `age` recipient, stored on-chain).
- **Instructions:** `initialize`, `register_moderator` (admin), `set_moderator_active`
  (the mod itself), `submit_verdict` (mod → CPI `desc_escrow::record_verdict`, signed by
  the `[b"authority", config]` PDA, which is the escrow's `settlement_authority`).

**A) build + deploy — in the program workspace `programs/desc_moderation`:**
```bash
cd programs/desc_moderation
anchor build
# deploy onto the running localnet — use --use-rpc; the default TPU/websocket path
# fails against the local test-validator with a "Failed to get slot leaders" panic
solana program deploy target/deploy/desc_moderation.so \
  --program-id target/deploy/desc_moderation-keypair.json --use-rpc -u localhost
```

**B) initialize + onboard — in the API package `platform/apps/api`** (these are `apps/api`
pnpm scripts; they do **not** exist in the program workspace):
```bash
cd platform/apps/api        # from programs/desc_moderation that's:  cd ../../platform/apps/api
pnpm moderation-init                  # creates ModerationConfig (the PDA bootstrap already
                                      # set as settlement_authority can now sign)
pnpm moderator-register "Mod A"       # provision + fund + register on-chain
```

No repoint step — `bootstrap` already set the escrow's `settlement_authority` to this
program's verdict PDA. Verdicts flow **only** through the mod, recorded with `mod-run`
(next section). To rotate the authority manually: `update-config --settlement <PDA>`.

---

## Record a verdict (the mod)

With the program set up (above) and a contract in **`submitted`** state, verdicts go through
the **mod**, not the api — the mod's own wallet signs `desc_moderation::submit_verdict`,
which CPIs `record_verdict`. No settlement key.

```bash
cd platform/apps/api
pnpm mod-run <contractId|linkToken> pass        # or:  fail --note "criteria X not met"
```
Full pipeline: open+verify the sealed bundle (decrypt with the mod's identity → rebuild →
hash-match vs chain) → `runCheck` (V1 stub = your `pass`/`fail`) → `submit_verdict` signed
by the mod's wallet. **PASS** unlocks *Release*; **FAIL** unlocks *Reclaim deposit*. `<ref>`
is the `/contracts/<uuid>` uuid or the `/c/<token>` link token.

> Uses `./moderators/<slug>-{wallet.json,identity.key}` from `moderator-register`. One mod
> provisioned → auto-selected; multiple → pass `--mod <slug>`.

### Check the moderator's 1% reward

The mod earns a **1% surcharge** (in USDC) on **any verdict** — paid when the deal **settles**,
not at verdict time: on `release` (PASS) or `refund` (FAIL). A ghost-timeout (no verdict) pays
nothing. Verify it entirely on-chain — no UI:

```bash
cd platform/apps/api        # the ./moderators/ files live here (moderator-register's cwd)

# the mod's wallet pubkey (from its keypair file)
MOD=$(solana-keygen pubkey ./moderators/mod-a-wallet.json)

# before settling — should be 0 (or empty)
spl-token balance <USDC_MINT> --owner $MOD --url localhost

# create → accept → submit → pnpm mod-run <ref> pass → Release (in the UI or via the contract page)
# then check again — it jumps by 1% of the contract amount:
spl-token balance <USDC_MINT> --owner $MOD --url localhost
```

- `<USDC_MINT>` is the value from `pnpm bootstrap` (also `apps/api/.env`).
- The reward lands on **Release/Reclaim**, so run that step first, then re-check the balance.
- The initiator funds **amount + 3%** at create (2% protocol fee + 1% moderator surcharge);
  `./fund-wallets.sh <USDC_MINT>` mints plenty.

### Admin console — read-only oversight
```bash
cd platform/apps/admin && pnpm dev   # → http://localhost:5174
```
Paste the `ADMIN_TOKEN` (set it in `apps/api/.env` via `openssl rand -hex 32`, then restart
the api — the `/admin/*` read routes are fail-closed) to view all contracts + statuses. It
**does not judge** — the platform doesn't decide verdicts; the mods do.

> **Removed:** the old `POST /admin/contracts/:id/verdict` curl (api-signed with a hot
> settlement key) is **deleted** — the api holds no signing key, and the escrow trusts only
> the verdict PDA. Verdicts come from `mod-run` alone.

---

## Moderator registry (deliverable encryption)

Deliverables are sealed to the moderators' public keys (multi-recipient `age`
envelope), so the registry holds **who** they're encrypted to. The registry is now
**on-chain** — the `Moderator` accounts in the `desc_moderation` program (the chain is
the source of truth). `GET /config/moderators` reads them live. *(The old Postgres
`moderators` table is vestigial.)*

### Register a moderator
```bash
pnpm --filter api moderator-register "Mod A"
```
This provisions the mod's **wallet** keypair + **age identity** (saved under
`./moderators/`, gitignored), **funds** the wallet (SOL for gas + a USDC account for
the 1% reward), and calls **`register_moderator`** on-chain (admin-signed) — writing the
recipient into the `Moderator` account.

- **Prereq:** validator up, both programs deployed, `pnpm moderation-init` done, and
  `USDC_MINT` set (`pnpm bootstrap`).
- **Hand the two files to that mod's runner:** `*-wallet.json` signs `submit_verdict`,
  `*-identity.key` decrypts deliverables. Never commit them.
- **Scalable by design:** run it once per moderator (admin-gated in V1; permissionless +
  stake in V2). Deliverables encrypt to **all active** recipients; any one mod can decrypt.

### Inspect / manage
```bash
# what the browser fetches (active recipients, read from chain):
curl -s localhost:3000/config/moderators | jq .
```
A mod toggles its **own** `active` flag via `set_moderator_active` (signed by its own
wallet) — the admin can't. (A CLI for that lands with the mod runner.)

> You need **at least one active moderator** registered before a committer can
> encrypt a deliverable. (Encryption wiring is being added step by step; the registry
> + crypto core are in place.)

---

## Full lifecycle walkthrough (UI + one `mod-run`)

1. **Create** (wallet A, funded with SOL + USDC) → contract is `funded`, shows a link.
2. Open the **link** (`/c/<token>`) with **wallet B** (funded with SOL, ≠ A) → **Accept** → `active`.
3. As wallet B → **Submit deliverable** (pick a folder → sealed + encrypted to the mods) → `submitted`.
4. **Record verdict**: `pnpm --filter api mod-run <contractId|linkToken> pass`.
5. Refresh → **Release** → `settled`. ✅

---

## Ports

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| Admin (moderator console) | http://localhost:5174 |
| API | http://localhost:3000 |
| Validator RPC | http://localhost:8899 |
| Postgres | localhost:5433 (or `POSTGRES_PORT`) |

See `apps/api/scripts/README.md` for the operator scripts (`bootstrap`, `update-config`, e2e).
