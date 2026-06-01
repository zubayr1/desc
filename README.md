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
├── program/                    # Solana escrow program (Rust / Anchor)
└── platform/
    ├── apps/
    │   ├── web/                # user frontend — 4 screens
    │   ├── admin/              # manual dispute review tool (internal)
    │   └── api/                # backend + verdict aggregator
    ├── packages/
    │   └── shared/             # shared TS domain types
    └── services/
        └── ai/                 # Helper AI + moderator agents (Python)
```

## What each piece does

| Piece | Responsibility |
|---|---|
| `program` | On-chain escrow: deposit, lock, release-on-verdict, refund-on-timeout. Holds funds — neither party does. |
| `apps/web` | Public product. 4 screens: **draft contract**, **review & accept** (from shareable link), **submit deliverable**, **view verdict & settlement**. Talks only to `api`. |
| `apps/api` | The brain. Owns the DB + contract lifecycle, generates shareable links, builds/submits Solana txns, calls the AI service, and runs the **verdict aggregator** (consensus → settle; no consensus → flag for manual review). |
| `apps/admin` | Internal tool for the team to investigate disputes flagged by the aggregator. Separate auth from `web`. |
| `packages/shared` | Library (not a service). Single source of truth for domain types (contract shape, status enum, verdict shape, AI DTOs) imported by `web`, `admin`, `api`. |
| `services/ai` | Helper AI (drafts checkable acceptance criteria from a brief) + N federated moderator agents (independent verdict + confidence per deliverable). Python. |

## Data flow

```
web / admin  ──HTTP──►  api  ──HTTP──►  ai (Helper AI + N moderators)
                         │
                         ├── Postgres (contract state)
                         └── Solana RPC ──► program (escrow)

shared ── types imported by web, admin, api
```

## Contract lifecycle

```
draft → pending_acceptance → active → submitted → under_verification
      → settled | refunded | disputed
(draft | pending_acceptance) → cancelled
```

## V1 commitments (from planning)

- USDC settlement, no native token.
- Pricing: 2% base protocol fee + per-moderator surcharge; moderator count scales with contract value.
- Random moderator assignment by the protocol (initiators never pick their own).
- Objectively-verifiable deliverables only.
- Manual dispute review by the team (target SLA: 48 business hours).
- Federated platform-run moderators (third-party pluggable pool is V2).

Marketplace, listings, discovery, decomposition, human jurors, SDK, embedded wallets,
fiat ramps, reputation, and subjective deliverables are all explicitly deferred to V2+.
