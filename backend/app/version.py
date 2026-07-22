"""Resolves the app version from the repo-root VERSION file.

Split out from app.main so routers (e.g. health) can import APP_VERSION without
importing app.main, which would create a circular import — app.main imports the
routers package during startup.
"""

import os
from pathlib import Path


def _read_app_version() -> str:
    """Read the app version from the repo-root VERSION file (single source of
    truth shared with frontend/package.json and the Android build), or the
    APP_VERSION env var as an override for deployments that can't ship the file.

    Ancestor search (rather than a fixed relative path) because this module sits
    at a different depth from repo root in a checkout (backend/app/version.py)
    than in the Docker image (COPY'd flat into /app alongside VERSION).
    """
    env_version = os.environ.get("APP_VERSION")
    if env_version:
        return env_version
    for directory in Path(__file__).resolve().parents:
        candidate = directory / "VERSION"
        if candidate.is_file():
            return candidate.read_text().strip()
    return "unknown"


APP_VERSION = _read_app_version()
