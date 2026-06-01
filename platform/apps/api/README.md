# api

The backend brain. `web` and `admin` talk only to this; it owns the database,
orchestrates the AI service, and is the only thing that writes to the chain.

> Status: **placeholder** — only `src/index.ts` exists. Framework and DB layer
> are deliberately undecided (see TODO).

## Responsibilities (V1)

- **Contract lifecycle** — owns + persists the state machine:
  `draft → pending_acceptance → active → submitted → under_verification → settled | refunded | disputed`
  (`draft | pending_acceptance → cancelled`).
- **Shareable links** — generate the link token the initiator sends the committer; resolve it on open (no account needed).
- **Helper AI orchestration** — call `services/ai` to draft acceptance criteria during drafting.
- **Escrow / chain** — build + submit Solana txns to `program` (fund, lock, release, refund); track confirmations. Pick moderator count from contract value; compute 2% fee + per-moderator surcharge.
- **Moderator orchestration** — on submission, **randomly assign** N moderators, fan out verify requests to `ai`, collect verdicts.
- **Verdict aggregator** — consensus → trigger on-chain settle/refund; no consensus → flag `disputed`.
- **Admin endpoints** — serve the dispute queue + accept manual resolutions from `admin`.

## Planned structure (TODO — none of this exists yet)

```
api/src/
├── index.ts              # server bootstrap + route registration   [stub exists]
├── routes/               # HTTP handlers (thin)                     [ ]
├── contracts/            # lifecycle state machine + service logic  [ ]
├── aggregator/           # verdict consensus rules                  [ ]
├── solana/               # escrow client (wraps program IDL)        [ ]
├── ai/                   # typed client for services/ai             [ ]
├── links/                # shareable-link token gen + resolution    [ ]
└── db/                   # schema + queries                         [ ]
```

## Rough endpoint surface (TODO)

```
POST /contracts                     # create draft
POST /contracts/ai/draft-criteria   # Helper AI proposes criteria
POST /contracts/:id/fund            # build/submit escrow deposit
GET  /links/:token                  # committer opens shareable link
POST /links/:token/accept           # committer connects wallet + accepts
POST /contracts/:id/deliverable     # committer submits work
GET  /contracts/:id                 # status + verdict for both parties

# internal / admin
GET  /admin/disputes
POST /admin/disputes/:id/resolve
```

## Decisions deferred

- [ ] Framework: Fastify (leaning) vs NestJS vs Express. (Runs framework-free via `tsx` for now.)
- [ ] DB access layer: Drizzle vs Prisma (Postgres either way).
- [x] `package.json` + `tsconfig.json` added — `api` is now a pnpm workspace member.
- [x] `@repo/shared` linked as a dependency (placeholder types for now).
