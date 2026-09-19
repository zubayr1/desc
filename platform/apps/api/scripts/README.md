# api scripts — operator / admin CLIs

These are **operator tools, not HTTP endpoints.** They sign with the **cold
authority** (`~/.config/solana/id.json` on localnet), which the running api
server never holds — so config/admin actions happen from a secure machine, not
over the network. The server holds **no signing key at all**: verdicts are signed
by moderators' own wallets.

| Script | Program instruction | When |
|---|---|---|
| `bootstrap.ts` | `initialize_config` | Once per cluster, at setup |
| `update-config.ts` | `update_config` | Whenever protocol params change |
| `moderation-init.ts` | `desc_moderation::initialize` | Once, after bootstrap |
| `moderator-register.ts` | `desc_moderation::register_moderator` | Once per moderator |
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
2. airdrops SOL to the authority (localnet only)
3. creates a dev **USDC mint** (6 decimals) + the protocol **treasury** token account *(localnet only)*
4. calls **`initialize_config`** with `authority` = cold key, `settlement_authority` = the `desc_moderation` verdict PDA, `protocol_fee_bps` = 200

There is no hot settlement keypair. Moderator pricing is **not** set here — each
moderator sets its own (see `moderator-register`).

**Prereq:** a validator running with the program deployed (`anchor localnet`).

```bash
pnpm bootstrap
```

It prints the values to put in `apps/api/.env`:

```
CONFIG_AUTHORITY=<cold authority pubkey>
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
pnpm update-config --settlement <PUBKEY> # rotate the settlement authority
pnpm update-config --fee-bps 150 --pause # combine in one tx
```

| Flag | Effect |
|---|---|
| `--pause` / `--unpause` | toggle the global kill-switch |
| `--fee-bps <n>` | protocol fee in basis points (≤ 1000 = 10% max) |
| `--treasury <pubkey>` | destination token account for fees |
| `--settlement <pubkey>` | the key allowed to `record_verdict` |

`--settlement` must stay the `desc_moderation` verdict PDA: escrow only accepts
moderators whose verdict PDA matches it, so pointing it anywhere else makes every
moderated escrow uncreatable.

`authority` itself is **not** changeable (it's part of the Config PDA seed).

---

## `moderator-register` — `register_moderator`

Provisions a moderator's wallet + `age` identity (under `./moderators/`), funds
it, and registers it on-chain **with its own price**.

```bash
pnpm moderator-register "Olympus (Mod-Claude-Opus)" --base-bps 100
pnpm moderator-register "Hikaru (Mod-Claude-Haiku)" --base-bps 50
```

| Flag | Default | Meaning |
|---|---|---|
| `--base-bps <n>` | **required** | share of the contract amount (100 = 1%, max 500) |
| `--fee-per-kb <n>` | 0 | V2 size pricing — escrow rejects non-zero today |
| `--max-bundle-kb <n>` | 0 (no limit) | V2 size pricing — escrow rejects non-zero today |

The model it judges with is **not** a flag: add `MODEL_<SLUG>=<model id>` to `.env`
(e.g. `MODEL_HIKARU_MOD_CLAUDE_HAIKU=claude-haiku-4-5`) — the script prints the exact line.

A moderator changes its own price later with `update_moderator_pricing` (signed
by its wallet). Escrows already created keep the price they snapshotted.

---

## `e2e/` — end-to-end checks

Drive the running api against localnet, one flow per file.

**Prereq (all):** validator with **both** programs, `pnpm bootstrap`,
`pnpm moderation-init`, at least one `pnpm moderator-register …`, `pnpm db:push`,
and the api running (`pnpm dev`). With several moderators, each contract is
created with the **cheapest** active one, and the verdict is signed by whichever
moderator the escrow was assigned — its wallet must be in `./moderators/`.

| Command | File | Flow |
|---|---|---|
| `pnpm e2e:all` | `e2e/all.ts` | runs every flow below + prints a summary |
| `pnpm e2e:create` | `e2e/e2e_create.ts` | create → fund |
| `pnpm e2e:cancel` | `e2e/e2e_cancel.ts` | create → fund → cancel (full refund) |
| `pnpm e2e:accept` | `e2e/e2e_accept.ts` | … → accept (funded → active) |
| `pnpm e2e:submit` | `e2e/e2e_submit.ts` | … → submit deliverable (hash verified) |
| `pnpm e2e:verdict` | `e2e/e2e_verdict.ts` | … → verdict (signed by the moderator's wallet) |
| `pnpm e2e:release` | `e2e/e2e_release.ts` | full happy path → settled |
| `pnpm e2e:refund` | `e2e/e2e_refund.ts` | verdict(fail) → refund |
| `pnpm e2e:mutual-cancel` | `e2e/e2e_mutual_cancel.ts` | two-signer unwind → refunded |

Each funds a fresh initiator/committer, builds the tx via the api, signs it
locally, and submits it back through the api. The initiator gets **1070 USDC**:
1000 amount + 20 fee + up to a 5% moderator price. The scripts send no fee — the
program reads the moderator's price.
