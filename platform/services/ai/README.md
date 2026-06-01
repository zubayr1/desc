# ai service

The AI layer: **Helper AI** (drafts checkable acceptance criteria) and the
**moderator agents** (N independent verifiers). Called by `api`, never by
browsers. Stateless — `api` owns orchestration (random assignment, fan-out,
verdict aggregation).

> Status: **placeholder** — structure + `/health` only. No LLM logic yet.

## Two responsibilities

- **Helper AI** (`app/helper/`) — brief + deliverable type → proposed acceptance
  criteria + warnings. The make-or-break piece of V1: vague criteria → failed
  verification → disputes.
- **Moderators** (`app/moderator/`) — the platform's **default federated pool**.
  Each variant is a distinct prompt/model combo so the N moderators judge
  independently (collusion-resistance). V2 opens this pool to third parties.

## Endpoints (TODO)

```
GET  /health           # exists
POST /draft-criteria   # Helper AI            [ ]
POST /verify           # one moderator verdict [ ]
```

## Structure

```
services/ai/
├── app/
│   ├── main.py            # FastAPI app + /health  [stub]
│   ├── helper/            # Helper AI
│   │   ├── routes.py      #   POST /draft-criteria  [ ]
│   │   ├── service.py     [ ]
│   │   ├── schemas.py     #   mirror @repo/shared DTOs  [ ]
│   │   └── prompts/       #   templates per deliverable type
│   ├── moderator/         # default federated moderators
│   │   ├── routes.py      #   POST /verify  [ ]
│   │   ├── service.py     [ ]
│   │   ├── variants.py    #   prompt/model variant configs  [ ]
│   │   ├── schemas.py     [ ]
│   │   └── prompts/
│   └── shared/            # LLM client, config, base schemas  [ ]
├── pyproject.toml
└── README.md
```

## Running (later)

`uv` isn't installed on this box. Either install it (`uv sync && uv run fastapi dev app/main.py`)
or use a plain venv:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

## Notes

- Schemas here (pydantic) mirror the AI DTOs in `@repo/shared`; the two languages
  can't share a type package, so keep them in sync by hand.
- Anthropic SDK to be added per moderator variant when wiring up real calls.
