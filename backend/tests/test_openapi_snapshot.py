"""``frontend/openapi.json`` is a committed snapshot of the API's OpenAPI document; it must follow the backend."""

import json

from app import openapi_export


def test_the_committed_openapi_snapshot_matches_the_application() -> None:
    assert openapi_export.SNAPSHOT.exists(), (
        "frontend/openapi.json is missing: run `pnpm api:generate` in frontend/ and commit the result"
    )
    assert openapi_export.SNAPSHOT.read_text(encoding="utf-8") == openapi_export.document(), (
        "frontend/openapi.json is stale: run `pnpm api:generate` in frontend/ and commit the result"
    )


def test_the_snapshot_is_the_same_on_every_export() -> None:
    assert openapi_export.document() == openapi_export.document()


def test_the_snapshot_does_not_carry_the_release_version() -> None:
    assert json.loads(openapi_export.document())["info"]["version"] == "snapshot"
