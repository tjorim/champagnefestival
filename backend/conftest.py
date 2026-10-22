"""Chooses the test database before ``tests/conftest.py`` imports the application.

The default is a throwaway SQLite file, so the suite needs no container (see ``app.sqlite_compat``).
CI also runs it against PostgreSQL, the production database, by setting ``TEST_DATABASE_URL``, for
example ``postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne``, a *separate*
database from the dev one. Create it once with:

    psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE test_champagne;"

On SQLite the application's own engine (used by background workers and the outbox, which do not
go through the ``get_db`` override) has to point at the same file, so ``DATABASE_URL`` follows.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

os.environ.setdefault("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{Path(tempfile.gettempdir()) / 'test_champagne.db'}")
if os.environ["TEST_DATABASE_URL"].startswith("sqlite"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
