"""Health check and metrics endpoints."""

import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.observability import metrics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])


def _require_metrics_access(request: Request) -> None:
    """Verify HMAC secret for metrics endpoint access."""
    secret = settings.metrics_secret
    if not secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    provided = request.headers.get("X-Metrics-Secret", "")
    if not hmac.compare_digest(provided, secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/health/liveness")
def liveness_check() -> dict[str, str]:
    """Fast alive check — no DB hit. Suitable for load-balancer liveness probes."""
    return {"status": "alive"}


@router.get("/health/readiness")
async def readiness_check(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """DB connectivity check with statement timeout protection.

    Returns 200 when the database is reachable, 503 otherwise.
    Suitable for load-balancer readiness probes.
    """
    try:
        await db.execute(text("SET LOCAL statement_timeout = '2000'"))
        await db.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Readiness check failed: database connectivity error")
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

    Pass the shared secret in the ``X-Metrics-Secret`` request header.
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
