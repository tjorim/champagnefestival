"""FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastmcp.utilities.lifespan import combine_lifespans
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import create_tables
from app.mcp_server import build_keycloak_auth, create_mcp_server
from app.middleware import add_cors_middleware, add_rate_limit_middleware, add_trusted_host_middleware
from app.observability import request_metrics_middleware
from app.routers import (
    areas,
    audit,
    auth,
    check_in,
    contact,
    editions,
    events,
    exhibitors,
    health,
    layouts,
    live,
    me,
    members,
    people,
    registrations,
    rooms,
    table_types,
    tables,
    venue_plan,
    venues,
    volunteer_ops,
    volunteers,
)

# Configure logging before any other module uses a logger.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

_mcp = create_mcp_server(auth=build_keycloak_auth()) if settings.mcp_base_url else None
_mcp_app = _mcp.http_app(path="/") if _mcp is not None else None


if settings.sentry_dsn:
    try:
        import sentry_sdk  # ty: ignore[unresolved-import]

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=settings.sentry_traces_sample_rate,
        )
        logger.info(
            "✓ Sentry error tracking initialized (traces_sample_rate=%s)",
            settings.sentry_traces_sample_rate,
        )
    except ImportError:
        logger.warning("SENTRY_DSN configured but sentry-sdk is not installed — install sentry-sdk[fastapi]")


@asynccontextmanager
async def _app_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    logger.info("=" * 60)
    logger.info("Champagnefestival API — starting up")
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
    logger.info("Champagnefestival API shutting down...")


lifespan = combine_lifespans(_app_lifespan, _mcp_app.lifespan) if _mcp_app is not None else _app_lifespan

app = FastAPI(
    title="Champagnefestival API",
    version="0.1.1",
    description=(
        "Backend for the VIP reservation and check-in system. "
        "See the /docs endpoint for the interactive OpenAPI explorer."
    ),
    lifespan=lifespan,
)

add_cors_middleware(app, settings, mcp_enabled=_mcp_app is not None)
add_rate_limit_middleware(app, settings)

# Metrics middleware is registered next-to-last so it is close to outermost and
# captures every request, including those short-circuited by CORS, rate
# limiting, or OIDC auth.
app.add_middleware(BaseHTTPMiddleware, dispatch=request_metrics_middleware)

# Host header validation is registered last so it is outermost and rejects
# requests with an unrecognised Host before any other middleware runs.
add_trusted_host_middleware(app, settings)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    logger.warning("IntegrityError on %s: %s", request.url.path, exc.orig)
    return JSONResponse(
        status_code=409,
        content={"detail": "Cannot complete this operation because related records exist."},
    )


app.include_router(registrations.router)
app.include_router(auth.router)
app.include_router(audit.router)
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
app.include_router(volunteer_ops.router)
app.include_router(areas.router)
app.include_router(venue_plan.router)
app.include_router(me.router)
app.include_router(live.router)
app.include_router(health.router)

if _mcp_app is not None:
    app.mount("/mcp", _mcp_app)
    logger.info("✓ MCP server mounted at /mcp")
