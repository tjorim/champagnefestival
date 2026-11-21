"""Health, metrics and small generic responses."""

from __future__ import annotations

from datetime import datetime

from app.schemas.base import ResponseModel


# Small operational responses
# Each model describes the body a route already sends; none changes a wire shape.
class OkOut(ResponseModel):
    """Acknowledges a retry-safe public write; ``true`` also for an idempotent replay."""

    ok: bool


class ServerTimeOut(ResponseModel):
    server_time: datetime


class HealthStatusOut(ResponseModel):
    status: str


class HealthOut(HealthStatusOut):
    version: str
    commit: str
    liveness_endpoint: str
    readiness_endpoint: str


class MetricsOut(ResponseModel):
    """Per-process request metrics (``per_process`` is always true)."""

    uptime_seconds: float
    request_total: int
    error_total: int
    request_rate_per_second: float
    error_rate: float
    latency_avg_ms: float
    latency_p50_ms: float
    latency_p99_ms: float
    per_process: bool
