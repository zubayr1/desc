"""ai service — FastAPI entrypoint (placeholder).

Mounts the Helper AI and moderator routers. Called by `api`, never by browsers.
Stateless: `api` owns orchestration (random assignment, fan-out, aggregation).

Nothing is implemented yet — see README.md for the planned structure.
"""

from fastapi import FastAPI

app = FastAPI(title="desc ai service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# TODO: mount routers
#   from app.helper.routes import router as helper_router
#   from app.moderator.routes import router as moderator_router
#   app.include_router(helper_router)
#   app.include_router(moderator_router)
