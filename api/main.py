"""FastAPI application: the /api routers plus the built single-page web app.

Run:  python -m uvicorn api.main:app --port 8010

- On startup the MySQL schema is created if needed and the demo data is seeded when the
  database is empty (same rule as the Streamlit app).
- Every error response is JSON {"detail": "<human readable message>"}.
- When WEB_DIST (default <repo>/web/dist) holds a build, it is served at / with an
  index.html fallback for client-side routes. /api paths never fall back to the SPA.
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import pymysql
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from followup import db

from . import routes_agent, routes_auth, routes_data, routes_demo

log = logging.getLogger("api")

REPO_ROOT = Path(__file__).resolve().parent.parent
WEB_DIST = Path(os.getenv("WEB_DIST") or REPO_ROOT / "web" / "dist").resolve()
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def _init_db():
    db.init_schema()
    if not db.one("SELECT COUNT(*) n FROM contacts")["n"]:
        db.reset()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        await run_in_threadpool(_init_db)
    except pymysql.err.MySQLError:
        log.exception("Could not prepare the MySQL database - check the MYSQL_* settings in .env")
        raise
    yield
    db.pool.close_all()


app = FastAPI(title="Follow-Up Agent API", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json",
              swagger_ui_oauth2_redirect_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ errors -> {"detail": str}

_LOC_SOURCES = {"body", "query", "path", "header", "cookie"}


def _validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "The request is not valid."
    err = errors[0]
    if err.get("type") == "json_invalid":
        return "The request body is not valid JSON."
    field = ".".join(str(p) for p in err.get("loc", ()) if p not in _LOC_SOURCES)
    if not field and err.get("type") in ("model_attributes_type", "dict_type"):
        return "The request body must be a JSON object."
    if err.get("type") == "missing":
        return f"'{field}' is required." if field else "A request body is required."
    msg = (err.get("msg") or "Value is not valid").rstrip(".")
    return f"'{field}': {msg}." if field else f"{msg}."


@app.exception_handler(RequestValidationError)
async def _on_validation_error(_request: Request, exc: RequestValidationError):
    return JSONResponse({"detail": _validation_message(exc)}, status_code=422)


@app.exception_handler(pymysql.err.OperationalError)
async def _on_database_error(_request: Request, exc: pymysql.err.OperationalError):
    log.error("Database error: %s", exc)
    return JSONResponse({"detail": "The database is unavailable or busy. Please try again in a moment."},
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE)


@app.exception_handler(Exception)
async def _on_unexpected_error(_request: Request, _exc: Exception):
    # Starlette logs the traceback; the client only gets a generic message.
    return JSONResponse({"detail": "Something went wrong on the server. Please try again."},
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ------------------------------------------------------------------ routes

for _module in (routes_auth, routes_data, routes_agent, routes_demo):
    app.include_router(_module.router)


# ------------------------------------------------------------------ built web app (mounted last)

def _spa_index() -> FileResponse:
    # Never cache index.html, so a new build is picked up on the next load.
    return FileResponse(WEB_DIST / "index.html", headers={"Cache-Control": "no-cache"})


if (WEB_DIST / "index.html").is_file():
    if (WEB_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
        if full_path:
            candidate = (WEB_DIST / full_path).resolve()
            if candidate.is_relative_to(WEB_DIST) and candidate.is_file():
                return FileResponse(candidate)
        return _spa_index()
else:
    log.info("No web build at %s - serving the API only", WEB_DIST)
