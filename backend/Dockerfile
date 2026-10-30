# uv comes from its own FROM stage, not `COPY --from=<image>`: Dependabot's docker updater only reads
# FROM lines (dependabot/dependabot-core#5103), so this is what lets it propose uv bumps.
FROM ghcr.io/astral-sh/uv:0.13.6@sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0 AS uv

# ── build stage ──────────────────────────────────────────────────────────────
FROM python:3.15-slim AS builder

COPY --from=uv /uv /usr/local/bin/uv

WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ── runtime stage ─────────────────────────────────────────────────────────────
# Shared base for the api and worker targets below — neither the HTTP
# healthcheck nor a command belongs here since only api exposes a port.
FROM python:3.15-slim AS runtime

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY backend/ .
# Single source of truth for the app version (see app/version.py) — this build
# needs repo-root context (not just backend/) to reach it.
COPY VERSION ./VERSION

ENV PATH="/app/.venv/bin:$PATH"

# Run as non-root user for security hardening.
RUN groupadd --gid 1000 appgroup \
    && useradd --uid 1000 --gid appgroup --shell /bin/bash --no-create-home appuser \
    && chown -R appuser:appgroup /app

USER appuser

# ── api target ────────────────────────────────────────────────────────────────
FROM runtime AS api

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── worker target ─────────────────────────────────────────────────────────────
# Runs the durable outbox worker. It exposes no HTTP server, so liveness is
# checked via a heartbeat file the worker's loop touches each pass (see
# app/worker.py) rather than an HTTP probe. Keep the staleness threshold below
# in sync with HEARTBEAT_STALE_SECONDS there.
FROM runtime AS worker

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import pathlib, sys, time; p = pathlib.Path('/tmp/worker-heartbeat'); sys.exit(0 if p.exists() and time.time() - p.stat().st_mtime < 600 else 1)"

CMD ["python", "-m", "app.worker"]
