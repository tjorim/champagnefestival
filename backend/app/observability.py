"""In-process request metrics collector and middleware."""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock

from fastapi import Request
from starlette.responses import Response as StarletteResponse

logger = logging.getLogger(__name__)


@dataclass
class MetricsSnapshot:
    uptime_seconds: float
    total_requests: int
    total_errors: int
    request_rate_per_second: float
    error_rate: float
    latency_avg_ms: float
    latency_p50_ms: float
    latency_p99_ms: float


class InMemoryRequestMetrics:
    """In-process metrics collector.

    Values are process-local, reset on restart, and are not aggregated across
    workers. Latency percentiles are computed from the last
    ``_MAX_LATENCY_SAMPLES`` requests.
    """

    _MAX_LATENCY_SAMPLES: int = 1000

    def __init__(self) -> None:
        self._lock = Lock()
        self._started_at = time.monotonic()
        self._total_requests = 0
        self._total_errors = 0
        self._latency_sum_ms = 0.0
        self._latency_samples: deque[float] = deque(maxlen=self._MAX_LATENCY_SAMPLES)

    def record(self, *, status_code: int, latency_ms: float) -> None:
        with self._lock:
            self._total_requests += 1
            if status_code >= 500:
                self._total_errors += 1
            self._latency_sum_ms += latency_ms
            self._latency_samples.append(latency_ms)

    def snapshot(self) -> MetricsSnapshot:
        with self._lock:
            uptime_seconds = max(time.monotonic() - self._started_at, 1e-9)
            total_requests = self._total_requests
            total_errors = self._total_errors
            latency_avg_ms = self._latency_sum_ms / total_requests if total_requests else 0.0

            samples = sorted(self._latency_samples)
            if samples:
                n = len(samples)
                # Nearest-rank percentile method
                p50_idx = max(0, int(n * 0.50) - 1) if n >= 2 else 0
                p99_idx = max(0, int(n * 0.99) - 1) if n >= 100 else n - 1
                latency_p50_ms = samples[p50_idx]
                latency_p99_ms = samples[p99_idx]
            else:
                latency_p50_ms = 0.0
                latency_p99_ms = 0.0

            return MetricsSnapshot(
                uptime_seconds=uptime_seconds,
                total_requests=total_requests,
                total_errors=total_errors,
                request_rate_per_second=total_requests / uptime_seconds,
                error_rate=total_errors / total_requests if total_requests else 0.0,
                latency_avg_ms=latency_avg_ms,
                latency_p50_ms=latency_p50_ms,
                latency_p99_ms=latency_p99_ms,
            )

    def reset(self) -> None:
        with self._lock:
            self._started_at = time.monotonic()
            self._total_requests = 0
            self._total_errors = 0
            self._latency_sum_ms = 0.0
            self._latency_samples.clear()


metrics = InMemoryRequestMetrics()


async def request_metrics_middleware(request: Request, call_next):
    """Starlette-compatible middleware that records per-request metrics."""
    started = time.perf_counter()
    status_code = 500
    response = None
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        logger.exception("Unhandled error in request middleware: %s %s", request.method, request.url.path)
        response = StarletteResponse("Internal Server Error", status_code=500)

    latency_ms = (time.perf_counter() - started) * 1000
    metrics.record(status_code=status_code, latency_ms=latency_ms)
    return response
