# api scripts — operator / admin CLIs

These are **operator tools, not HTTP endpoints.** They sign with the **cold
authority** (`~/.config/solana/id.json` on localnet), which the running api
server never holds — so config/admin actions happen from a secure machine, not
over the network. (The server holds only the *hot settlement* key, used solely
for `record_verdict`.)

| Script | Program instruction | When |
|---|---|---|
| `bootstrap.ts` | `initialize_config` | Once per cluster, at setup |
| `update-config.ts` | `update_config` | Whenever protocol params change |
| `e2e/*.ts` | (none — drive the api) | Manual end-to-end checks |

Run them with pnpm from `apps/api`:

```bash
pnpm bootstrap
pnpm update-config <flags>
pnpm e2e:create
pnpm e2e:cancel
```

---

## `bootstrap` — `initialize_config` (one-time setup)

Prepares a cluster so the api has something to talk to. It:

1. loads the **cold authority** (`AUTHORITY_KEYPAIR_PATH`, default `~/.config/solana/id.json`)
2. loads-or-generates the **hot settlement keypair** (`SETTLEMENT_KEYPAIR_PATH`, default `./settlement-keypair.json`)
3. airdrops SOL to the authority (localnet only)
4. creates a dev **USDC mint** (6 decimals) + the protocol **treasury** token account *(localnet only)*
5. calls **`initialize_config`** with `authority` = cold key, `settlement_authority` = hot key, `protocol_fee_bps` = 200

**Prereq:** a validator running with the program deployed (`anchor localnet`).

```bash
pnpm bootstrap
```

It prints the three values to put in `apps/api/.env`:

```
CONFIG_AUTHORITY=<cold authority pubkey>
SETTLEMENT_KEYPAIR_PATH=./settlement-keypair.json
USDC_MINT=<the dev mint it created>
```

Notes:
- `initialize_config` is **one-shot per authority** — the Config PDA can be created only once. Re-running after the Config exists will fail. On localnet you re-run after wiping the validator (it mints a **fresh** USDC mint each time, so update `USDC_MINT` in `.env`).
- **Production** runs steps 3–4 differently: real SOL (no airdrop), the real USDC mint (no creation), and the cold authority is ideally a **multisig**.

---

## `update-config` — `update_config`

Changes on-chain protocol parameters. Only the flags you pass are changed (the
program's `Option` args mean "leave unchanged"); it prints the resulting Config.

```bash
pnpm update-config --pause               # kill-switch ON  (blocks new escrows)
pnpm update-config --unpause             # kill-switch OFF
pnpm update-config --fee-bps 250         # set protocol fee to 2.5%
pnpm update-config --treasury <PUBKEY>   # rotate the fee treasury token account
pnpm update-config --settlement <PUBKEY> # rotate the hot settlement authority
pnpm update-config --fee-bps 150 --pause # combine in one tx
```

| Flag | Effect |
|---|---|
| `--pause` / `--unpause` | toggle the global kill-switch |
| `--fee-bps <n>` | protocol fee in basis points (≤ 1000 = 10% max) |
| `--treasury <pubkey>` | destination token account for fees |
| `--settlement <pubkey>` | the key allowed to `record_verdict` |

**`--settlement` is the V1→V2 seam:** when the `desc_moderation` program ships,
point the settlement authority at its PDA with this one command — the escrow
program and api are unchanged.

`authority` itself is **not** changeable (it's part of the Config PDA seed).

---

## `e2e/` — end-to-end checks

Drive the running api against localnet, one flow per file.

**Prereq (all):** validator + program, `pnpm bootstrap` done, `pnpm db:push`
done, and the api running (`pnpm dev`).

| Command | File | Flow |
|---|---|---|
| `pnpm e2e:create` | `e2e/e2e_create.ts` | create → fund; asserts `status === "funded"` |
| `pnpm e2e:cancel` | `e2e/e2e_cancel.ts` | create → fund → cancel; asserts full refund + `cancelled` |

Each funds a fresh initiator, builds the tx via the api, signs it locally, and
submits it back through the api.
