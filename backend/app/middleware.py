"""Application middleware configuration."""

import logging
from collections.abc import Callable, Iterable
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter
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
        "allow_headers": ["Content-Type", "Accept", "Authorization", "X-Request-ID", "Idempotency-Key"],
        "expose_headers": ["X-Request-ID"],
    }

    if mcp_enabled:
        app.add_middleware(MCPAwareCORSMiddleware, **cors_kwargs)
    else:
        app.add_middleware(CORSMiddleware, **cors_kwargs)


class GeneralRateLimiter:
    """Global dependency: routing has resolved included routers before this runs.

    Mounted ASGI apps do not inherit dependencies; /mcp keeps its own
    authentication and integration-client rate policy. Storage is per worker.
    """

    def __init__(self, settings: Settings, *, exempt_routes: Iterable[Callable[..., Any]] = ()) -> None:
        self.enabled = settings.rate_limit_enabled
        self.limit = parse(settings.rate_limit_default)
        self.exempt_routes = frozenset(exempt_routes)
        self.storage = MemoryStorage()
        self.limiter = FixedWindowRateLimiter(self.storage)

    def reset(self) -> None:
        self.storage.reset()

    async def __call__(self, request: Request) -> None:
        if not self.enabled or request.scope.get("endpoint") in self.exempt_routes:
            return
        template = getattr(request.scope.get("route"), "path_format", None) or request.url.path
        if not self.limiter.hit(self.limit, get_client_ip(request), template):
            # Preserve SlowAPI's public response body, handled separately from
            # application HTTPExceptions so the diagnostic is not rewritten.
            raise GeneralRateLimitExceeded(str(self.limit))


class GeneralRateLimitExceeded(HTTPException):
    def __init__(self, limit: str) -> None:
        super().__init__(status_code=429, detail=f"Rate limit exceeded: {limit}")


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
