"""Health check and metrics endpoints."""

import asyncio
import hashlib
import hmac
import logging
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.observability import metrics
from app.oidc_config import OIDCTokenError, _resolve_jwks_uri

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])

METRICS_TOKEN_MAX_AGE_SECONDS = 60


def build_metrics_token(secret: str, timestamp: int | None = None) -> str:
    """Build a ``X-Metrics-Token`` value: ``<unix-timestamp>:<hex-hmac-sha256>``."""
    ts = str(timestamp if timestamp is not None else int(time.time()))
    mac = hmac.new(secret.encode(), ts.encode(), hashlib.sha256).hexdigest()
    return f"{ts}:{mac}"


def _require_metrics_access(request: Request) -> None:
    """Verify a timestamped HMAC token for metrics endpoint access.

    Expects ``X-Metrics-Token: <unix-timestamp>:<hex-hmac-sha256>``, the HMAC
    computed over the timestamp using METRICS_HMAC_SECRET. Rejecting tokens
    older than METRICS_TOKEN_MAX_AGE_SECONDS bounds how long a leaked token
    remains useful, unlike a static shared secret which is valid forever.
    """
    secret = settings.metrics_hmac_secret
    if not secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    timestamp_str, _, provided_mac = request.headers.get("X-Metrics-Token", "").partition(":")
    if not timestamp_str or not provided_mac:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    try:
        timestamp = int(timestamp_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from None

    if abs(time.time() - timestamp) > METRICS_TOKEN_MAX_AGE_SECONDS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    expected_mac = hmac.new(secret.encode(), timestamp_str.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(provided_mac, expected_mac):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/health/liveness")
def liveness_check() -> dict[str, str]:
    """Fast alive check — no DB hit. Suitable for load-balancer liveness probes."""
    return {"status": "alive"}


async def _check_jwks_reachable() -> bool:
    jwks_uri = await _resolve_jwks_uri()
    async with httpx.AsyncClient(timeout=5) as client:
        oidc_response = await client.get(jwks_uri)
    oidc_response.raise_for_status()
    return True


_JWKS_READINESS_CACHE_SECONDS = 30.0
_jwks_readiness_cache: tuple[float, bool] | None = None
_jwks_readiness_lock = asyncio.Lock()


async def _jwks_reachable() -> bool:
    global _jwks_readiness_cache  # noqa: PLW0603
    now = time.monotonic()
    if _jwks_readiness_cache is not None and now - _jwks_readiness_cache[0] < _JWKS_READINESS_CACHE_SECONDS:
        return _jwks_readiness_cache[1]

    async with _jwks_readiness_lock:
        now = time.monotonic()
        if _jwks_readiness_cache is not None and now - _jwks_readiness_cache[0] < _JWKS_READINESS_CACHE_SECONDS:
            return _jwks_readiness_cache[1]

        reachable = await _check_jwks_reachable()
        _jwks_readiness_cache = (now, True) if reachable else None
        return reachable


@router.get("/health/readiness")
async def readiness_check(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """DB + OIDC connectivity check.

    Returns 200 when both the database and OIDC JWKS endpoint are reachable, 503 otherwise.
    Suitable for load-balancer readiness probes.
    """
    try:
        await db.execute(text("SET LOCAL statement_timeout = '2000'"))
        await db.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Readiness check failed: database connectivity error")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready"}

    if settings.oidc_issuer_url:
        try:
            reachable = await _jwks_reachable()
        except OIDCTokenError:
            logger.exception("Readiness check failed: OIDC discovery failed")
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"status": "not_ready"}
        except Exception:
            logger.exception("Readiness check failed: OIDC JWKS endpoint unreachable")
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"status": "not_ready"}
        if not reachable:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"status": "not_ready"}

    return {"status": "ready"}


@router.get("/health")
def health_check() -> dict[str, str]:
    """Summary health response with links to liveness and readiness probes."""
    return {
        "status": "ok",
        "liveness_endpoint": "/api/health/liveness",
        "readiness_endpoint": "/api/health/readiness",
    }


@router.get("/metrics")
def metrics_endpoint(
    _: None = Depends(_require_metrics_access),
) -> dict[str, float | int]:
    """HMAC-protected endpoint returning uptime, request rate, error rate and latency percentiles.

    Pass a fresh ``<unix-timestamp>:<hex-hmac-sha256>`` token in the
    ``X-Metrics-Token`` request header (see ``build_metrics_token``); tokens
    older than ``METRICS_TOKEN_MAX_AGE_SECONDS`` are rejected.
    """
    snapshot = metrics.snapshot()
    return {
        "uptime_seconds": round(snapshot.uptime_seconds, 2),
        "request_total": snapshot.total_requests,
        "error_total": snapshot.total_errors,
        "request_rate_per_second": round(snapshot.request_rate_per_second, 4),
        "error_rate": round(snapshot.error_rate, 4),
        "latency_avg_ms": round(snapshot.latency_avg_ms, 2),
        "latency_p50_ms": round(snapshot.latency_p50_ms, 2),
        "latency_p99_ms": round(snapshot.latency_p99_ms, 2),
    }
