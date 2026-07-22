"""Application middleware configuration."""

import logging
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import Settings
from app.ratelimit import get_client_ip

logger = logging.getLogger(__name__)


class MCPAwareCORSMiddleware:
    def __init__(self, app: ASGIApp, **kwargs: Any) -> None:
        self._app = app
        self._cors = CORSMiddleware(app, **kwargs)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") == "http" and scope.get("path", "").startswith("/mcp"):
            await self._app(scope, receive, send)
        else:
            await self._cors(scope, receive, send)


def add_cors_middleware(app: FastAPI, settings: Settings, *, mcp_enabled: bool = False) -> None:
    cors_origins = settings.get_cors_origins_list()

    if not cors_origins:
        logger.warning("No CORS origins configured — all cross-origin requests will be blocked!")
    else:
        logger.info("CORS middleware configured with origins: %s", cors_origins)

    cors_kwargs: dict[str, Any] = {
        "allow_origins": cors_origins,
        "allow_credentials": "*" not in cors_origins,
        "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept", "Authorization", "X-Request-ID"],
        "expose_headers": ["X-Request-ID"],
    }

    if mcp_enabled:
        app.add_middleware(MCPAwareCORSMiddleware, **cors_kwargs)
    else:
        app.add_middleware(CORSMiddleware, **cors_kwargs)


def add_rate_limit_middleware(app: FastAPI, settings: Settings) -> Limiter:
    """Install a general, configurable per-IP rate limiter across every route.

    Applies RATE_LIMIT_DEFAULT per client IP and route unless RATE_LIMIT_ENABLED
    is false. This is a general floor, layered *underneath* the stricter,
    hardcoded 5-req/600s limiter (app.ratelimit.check_rate_limit) already applied
    to the check-in and registration endpoints — that one still overrides this
    default for those specific abuse-prone routes.
    """
    limiter = Limiter(
        key_func=get_client_ip,
        default_limits=[settings.rate_limit_default],
        enabled=settings.rate_limit_enabled,
    )
    app.state.limiter = limiter
    app.exception_handler(RateLimitExceeded)(_rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    return limiter


def add_trusted_host_middleware(app: FastAPI, settings: Settings) -> None:
    """Reject requests with an unrecognised Host header.

    A no-op when TRUSTED_HOSTS is empty (the development default) — Host header
    validation is required in production instead (see Settings.validate_production_oidc).
    """
    trusted_hosts = settings.get_trusted_hosts_list()
    if not trusted_hosts:
        logger.warning("No TRUSTED_HOSTS configured — Host header validation is disabled!")
        return
    # Logs a count only, not the configured values themselves.
    logger.info("Host header validation configured with %d allowed host pattern(s)", len(trusted_hosts))
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)
