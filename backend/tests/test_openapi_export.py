"""The frontend API types are generated from a committed OpenAPI snapshot; it must follow the backend."""

import json

import pytest

from app import openapi_export


def test_the_committed_openapi_snapshot_matches_the_application() -> None:
    if not openapi_export.SNAPSHOT.exists():
        pytest.skip("frontend/openapi.json is not part of this checkout")
    assert openapi_export.SNAPSHOT.read_text(encoding="utf-8") == openapi_export.document(), (
        "frontend/openapi.json is stale: run `pnpm api:generate` in frontend/ and commit the result"
    )


def test_the_snapshot_does_not_carry_the_release_version() -> None:
    assert json.loads(openapi_export.document())["info"]["version"] == "snapshot"
