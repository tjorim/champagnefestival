"""The OpenAPI document the frontend types are generated from.

`frontend/openapi.json` is a committed snapshot of this document; `frontend/src/api-schema/` is generated
from it by `pnpm api:generate`. Run `uv run python -m app.openapi_export` from `backend/` to rewrite the
snapshot, or with `--check` to fail when it is stale (the backend tests do the same).
"""

import json
import sys
from pathlib import Path

from .main import app

SNAPSHOT = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"


def document() -> str:
    """The schema as stable JSON text. The release version is left out so a release bump never stales it."""
    schema = app.openapi()
    return (
        json.dumps({**schema, "info": {**schema["info"], "version": "snapshot"}}, indent=2, ensure_ascii=False) + "\n"
    )


def main(argv: list[str]) -> int:
    current = document()
    if "--check" in argv:
        if not SNAPSHOT.exists() or SNAPSHOT.read_text(encoding="utf-8") != current:
            print(f"{SNAPSHOT} is stale: run `pnpm api:generate` in frontend/ and commit the result.", file=sys.stderr)
            return 1
        return 0
    SNAPSHOT.write_text(current, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
