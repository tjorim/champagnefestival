"""The global IntegrityError handler names the constraint that actually failed.

Every constraint failure used to be reported as "related records exist", which
describes a foreign-key problem. A unique violation — the failure mode behind
the person-merge bug — then sent admins hunting for related records that were
never the cause.
"""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace

import pytest
from sqlalchemy.exc import IntegrityError
from starlette.requests import Request

from app.main import integrity_error_handler


class _DriverError(Exception):
    """Stand-in for the DBAPI error SQLAlchemy wraps, carrying a SQLSTATE."""

    def __init__(self, message: str, pgcode: str | None = None) -> None:
        super().__init__(message)
        self.pgcode = pgcode
        self.sqlstate = pgcode


def _request(path: str = "/api/people/per_1/merge/per_2") -> Request:
    return Request({"type": "http", "method": "POST", "path": path, "headers": []})


async def _detail(pgcode: str | None) -> tuple[int, str]:
    exc = IntegrityError("UPDATE people SET ...", {}, _DriverError("boom", pgcode))
    response = await integrity_error_handler(_request(), exc)
    # JSONResponse.body is typed bytes | memoryview; bytes() accepts either.
    return response.status_code, json.loads(bytes(response.body))["detail"]


@pytest.mark.anyio
async def test_unique_violation_does_not_blame_related_records():
    status_code, detail = await _detail("23505")
    assert status_code == 409
    assert "already uses one of these values" in detail
    assert "related records" not in detail


@pytest.mark.anyio
async def test_foreign_key_violation_keeps_the_related_records_wording():
    status_code, detail = await _detail("23503")
    assert status_code == 409
    assert detail == "Cannot complete this operation because related records exist."


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("pgcode", "expected"),
    [("23502", "required field is missing"), ("23514", "fails a database constraint")],
)
async def test_other_known_sqlstates_get_their_own_wording(pgcode: str, expected: str):
    status_code, detail = await _detail(pgcode)
    assert status_code == 409
    assert expected in detail


@pytest.mark.anyio
async def test_unknown_sqlstate_falls_back_without_guessing():
    """A driver that reports no SQLSTATE must not be described as a FK problem."""
    status_code, detail = await _detail(None)
    assert status_code == 409
    assert detail == "Cannot complete this operation because it violates a database constraint."


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("pgcode", "code"),
    [
        ("23502", "required_field_missing"),
        ("23503", "related_records_exist"),
        ("23505", "duplicate_value"),
        ("23514", "constraint_violation"),
        (None, "constraint_violation"),
    ],
)
async def test_every_constraint_failure_carries_a_stable_code(pgcode: str | None, code: str):
    exc = IntegrityError("UPDATE people SET ...", {}, _DriverError("boom", pgcode))
    response = await integrity_error_handler(_request(), exc)

    assert json.loads(bytes(response.body))["code"] == code


@pytest.mark.anyio
async def test_the_log_names_the_route_template_not_the_raw_path(caplog: pytest.LogCaptureFixture):
    # A path can carry a credential (an access or check-in token), so the log must never contain it.
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/check-in/secret-path-token",
        "headers": [],
        "route": SimpleNamespace(path="/check-in/{token}"),
    }
    exc = IntegrityError("UPDATE people SET ...", {}, _DriverError("boom", "23505"))
    with caplog.at_level(logging.WARNING):
        await integrity_error_handler(Request(scope), exc)

    message = next(r.getMessage() for r in caplog.records if "IntegrityError" in r.getMessage())
    assert "/check-in/{token}" in message
    assert "secret-path-token" not in message
