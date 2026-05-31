"""FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastmcp.utilities.lifespan import combine_lifespans
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import create_tables
from app.mcp_server import build_keycloak_auth, create_mcp_server
from app.observability import request_metrics_middleware
from app.routers import (
    areas,
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

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment)
        logger.info("✓ Sentry error tracking initialized")
    except ImportError:
        logger.warning("SENTRY_DSN configured but sentry-sdk is not installed — install sentry-sdk[fastapi]")


@asynccontextmanager
async def _app_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
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


lifespan = combine_lifespans(_app_lifespan, _mcp_app.lifespan) if _mcp_app is not None else _app_lifespan

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

_cors_kwargs = dict(
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)
if _mcp_app is not None:
    class _MCPAwareCORSMiddleware:
        def __init__(self, app, **kwargs) -> None:
            self._app = app
            self._cors = CORSMiddleware(app, **kwargs)

        async def __call__(self, scope, receive, send) -> None:
            if scope.get("type") == "http" and scope.get("path", "").startswith("/mcp"):
                await self._app(scope, receive, send)
            else:
                await self._cors(scope, receive, send)

    app.add_middleware(_MCPAwareCORSMiddleware, **_cors_kwargs)
else:
    app.add_middleware(CORSMiddleware, **_cors_kwargs)

# Metrics middleware is registered last so it is outermost and captures every request,
# including those short-circuited by CORS or SuperTokens.
app.add_middleware(BaseHTTPMiddleware, dispatch=request_metrics_middleware)


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
app.include_router(volunteer_ops.router)
app.include_router(areas.router)
app.include_router(venue_plan.router)
app.include_router(me.router)
app.include_router(live.router)
app.include_router(health.router)

if _mcp_app is not None:
    app.mount("/mcp", _mcp_app)
    logger.info("✓ MCP server mounted at /mcp")
