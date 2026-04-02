"""FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from supertokens_python import get_all_cors_headers
from supertokens_python.framework.fastapi import get_middleware

from app.config import settings
from app.database import create_tables
from app.routers import (
    areas,
    check_in,
    contact,
    editions,
    events,
    exhibitors,
    layouts,
    members,
    people,
    registrations,
    rooms,
    table_types,
    tables,
    venues,
    volunteers,
)
from app.supertokens_config import init_supertokens

# Configure logging before any other module uses a logger.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize SuperTokens before the app handles any requests.
init_supertokens()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    logger.info("=" * 60)
    logger.info("Champagne Festival API — starting up")
    logger.info("=" * 60)

    settings.log_configuration()

    try:
        await create_tables()
        logger.info("✓ Database tables verified / created")
    except Exception as exc:
        logger.error(f"❌ Database initialisation failed: {exc}")
        raise

    logger.info("=" * 60)
    logger.info("Startup complete — server ready to accept connections")
    logger.info("=" * 60)

    yield

    # Shutdown
    logger.info("Champagne Festival API shutting down...")


app = FastAPI(
    title="Champagne Festival API",
    version="0.1.0",
    description=(
        "Backend for the VIP reservation and check-in system. "
        "See the /docs endpoint for the interactive OpenAPI explorer."
    ),
    lifespan=lifespan,
)

_cors_origins = settings.get_cors_origins_list()

if not _cors_origins:
    logger.warning("No CORS origins configured — all cross-origin requests will be blocked!")
else:
    logger.info(f"CORS middleware configured with origins: {_cors_origins}")

_supertokens_cors_headers = get_all_cors_headers() if settings.supertokens_connection_uri else []

# SuperTokens middleware handles /auth/* routes and session management.
# Added first so it is innermost in the stack.
# Only added when SuperTokens is configured (has a connection URI).
if settings.supertokens_connection_uri:
    app.add_middleware(get_middleware())

# CORSMiddleware is added after SuperTokens so it runs outermost, ensuring
# CORS headers are present on /auth/* responses that SuperTokens handles directly.
app.add_middleware(
    CORSMiddleware,  # ty: ignore[invalid-argument-type]
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"] + _supertokens_cors_headers,
    expose_headers=["front-token"],
)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    logger.warning("IntegrityError on %s: %s", request.url.path, exc.orig)
    return JSONResponse(
        status_code=409,
        content={"detail": "Cannot complete this operation because related records exist."},
    )


app.include_router(registrations.router)
app.include_router(members.router)
app.include_router(events.router)
app.include_router(check_in.router)
app.include_router(contact.router)
app.include_router(tables.router)
app.include_router(table_types.router)
app.include_router(venues.router)
app.include_router(rooms.router)
app.include_router(layouts.router)
app.include_router(exhibitors.router)
app.include_router(editions.router)
app.include_router(people.router)
app.include_router(volunteers.router)
app.include_router(areas.router)


class HealthResponse(BaseModel):
    status: str


@app.get("/health", tags=["meta"], response_model=HealthResponse)
async def health() -> HealthResponse:
    """Simple health-check endpoint used by the reverse proxy / systemd watchdog."""
    return HealthResponse(status="ok")
