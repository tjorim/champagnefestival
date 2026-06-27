"""Application middleware configuration."""

import logging
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings

logger = logging.getLogger(__name__)


class MCPAwareCORSMiddleware:
    def __init__(self, app, **kwargs: Any) -> None:
        self._app = app
        self._cors = CORSMiddleware(app, **kwargs)

    async def __call__(self, scope, receive, send) -> None:
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
