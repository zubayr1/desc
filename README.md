# desc — Solana bounty formalization tool (V1)

A **formalization tool, not a marketplace.** Two parties who already agreed on a deal
elsewhere (Twitter, Discord, Telegram) come here to make it safe: on-chain USDC escrow,
AI-drafted checkable acceptance criteria, federated AI moderators that randomly verify
the deliverable, and automated settlement.

> "You already made the deal — now make it safe."

V1 wedge: **Solana bounty-style dev work** with objectively-checkable deliverables
(merged PR, deployed contract, passing test suite, spec'd technical report).

## Layout

```
.
├── programs/
│   ├── desc_escrow/            # escrow + money lifecycle (Rust / Anchor)
│   └── desc_moderation/        # on-chain moderator registry; signs verdicts by CPI
└── platform/
    ├── apps/
    │   ├── web/                # user frontend
    │   ├── admin/              # read-only oversight console (internal)
    │   └── api/                # backend — builds unsigned txns, owns the read model
    ├── packages/
    │   └── shared/             # shared TS domain types + deliverable pipeline
    └── services/
        └── ai/                 # Helper AI + moderator agents (Python) — not built yet
```

## What each piece does

| Piece | Responsibility |
|---|---|
| `programs/desc_escrow` | On-chain escrow: deposit, accept, submit, record verdict, release, refund, cancel. Holds funds — neither party does. |
| `programs/desc_moderation` | Moderator registry. Each moderator is a PDA with its own wallet; it signs a verdict and CPIs into the escrow. It is the escrow's `settlement_authority`, so **no platform keypair can settle**. |
| `apps/web` | Public product: draft contract, review & accept (from a shareable link), submit a sealed deliverable, view verdict & settlement, dashboard. Talks only to `api`. |
| `apps/api` | Owns the DB + off-chain contract metadata, generates shareable links, and **builds unsigned transactions for the user to sign**. It holds no signing key and cannot move funds. |
| `apps/admin` | Read-only oversight for the team. It does **not** record verdicts — moderators do. Separate auth from `web`. |
| `packages/shared` | Library (not a service). Domain types plus the deliverable pipeline: validate → Merkle → `age` multi-recipient encryption. Imported by `web`, `admin`, `api`. |
| `services/ai` | Helper AI (drafts checkable acceptance criteria) + the moderator's verdict brain. **Placeholder** — a human operator answers through the same `runCheck` interface today. |

## Data flow

```
web / admin  ──HTTP──►  api
                         │
                         ├── Postgres (off-chain metadata + cached chain state)
                         ├── blind storage (deliverable ciphertext only)
                         └── Solana RPC ──► desc_escrow / desc_moderation

user wallet ── signs every transaction; the api only builds and submits them
moderator   ── decrypts, re-verifies the on-chain hash, signs its own verdict
shared      ── types + bundle pipeline imported by web, admin, api
```

## Contract lifecycle

Mirrors the program's on-chain `EscrowStatus` 1:1 — there is no off-chain `draft`
or `disputed` state.

```
funded → active → submitted → settled     (Pass, released)
                            → refunded    (Fail)
       → refunded                         (deadline passed, committer ghosted)
funded → cancelled                        (before anyone accepts)
```

## V1 commitments

- USDC settlement, no native token.
- Pricing: `max(2%, $1)` protocol fee + 1% per moderator; $50 minimum contract.
  Nothing is charged if the deal is cancelled or never delivered.
- Objectively-verifiable deliverables only (`mergeable`, `deployable`,
  `tests_pass`, `spec_met`).
- Deliverables are sealed in the browser and stored as ciphertext — the server
  never sees plaintext.
- Platform-run moderators; a single verdict settles. Manual dispute review by the
  team (target SLA: 48 business hours).
- Optional **no-mod** mode: the initiator may skip verification entirely.

Random moderator assignment, staking/slashing, k-of-n consensus, marketplace,
listings, discovery, decomposition, human jurors, SDK, embedded wallets, fiat
ramps, reputation, and subjective deliverables are all explicitly deferred to V2+.
