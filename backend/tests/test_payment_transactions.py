"""Payment ledger tests (#1019): recording, reconciliation, idempotent
replay/conflict, genuine concurrency, and the filtered CSV export.

The append-only payment_transactions table is created directly in migration
001 alongside the rest of the schema, with no separate backfill migration
(see docs/retry-safety.md) — nothing migration-specific to test here.

Mirrors the retry-safety test matrix in ``test_mcp_admin_bulk_create.py``
(replay, payload-mismatch conflict, actor isolation) for the
``payments.record_transaction`` scope, and the genuine two-session race in
``test_visitor_sessions.py`` for the concurrent-first-use case.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.mcp.admin import payments as mcp_payments
from app.mcp.utils import MCPToolError
from app.models import IdempotencyKey, PaymentTransaction
from app.services import payments_service, registrations_service
from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD, mcp_session_factory


def _normalize(value: Any) -> Any:
    """Recursively convert datetime/date values to ISO strings.

    A replayed idempotent result comes back with the timestamps it was
    stored with (already ISO strings, see ``app.services.idempotency``),
    while a fresh call returns live ``date``/``datetime`` objects — mirrors
    ``test_mcp_admin_bulk_create.py``'s helper of the same name.
    """
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


_edition_counter = 0


async def _registration(client, *, amount_due: str | None = None, person_id: str | None = None) -> str:
    global _edition_counter
    _edition_counter += 1
    edition_id = f"ledger-2026-{_edition_counter}"

    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/editions",
        json={
            "id": edition_id,
            "year": 2026,
            "month": "november",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": "Ledger Bourse",
            "description": "",
            "date": "2026-11-21",
            "start_time": "09:00",
            "end_time": "15:30",
            "category": "other",
            "registration_required": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    event_id = r.json()["id"]

    if person_id is None:
        r = await client.post("/api/people", json={"name": "Ledger Guest"}, headers=ADMIN_HEADERS)
        person_id = r.json()["id"]
    r = await client.post(
        "/api/registrations/admin",
        json={"person_id": person_id, "event_id": event_id, "guest_count": 1},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    registration_id = r.json()["id"]

    if amount_due is not None:
        r = await client.put(
            f"/api/registrations/{registration_id}",
            json={"amount_due": amount_due},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 200, r.text

    return registration_id


# ---------------------------------------------------------------------------
# Recording payments/refunds/corrections and reconciliation
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_multiple_payments_refund_and_correction_reconcile_and_stay_immutable(client):
    registration_id = await _registration(client, amount_due="100.00")

    r1 = await client.post(
        f"/api/registrations/{registration_id}/transactions",
        json={"kind": "payment", "amount": "60.00", "effective_date": "2026-01-01", "reference": "TX-1"},
        headers=ADMIN_HEADERS,
    )
    assert r1.status_code == 201, r1.text
    first_id = r1.json()["id"]

    r2 = await client.post(
        f"/api/registrations/{registration_id}/transactions",
        json={"kind": "payment", "amount": "40.00", "effective_date": "2026-01-15"},
        headers=ADMIN_HEADERS,
    )
    assert r2.status_code == 201, r2.text

    r3 = await client.post(
        f"/api/registrations/{registration_id}/transactions",
        json={
            "kind": "refund",
            "amount": "-20.00",
            "effective_date": "2026-02-01",
            "reversed_transaction_id": first_id,
            "note": "Partial refund of TX-1",
        },
        headers=ADMIN_HEADERS,
    )
    assert r3.status_code == 201, r3.text

    r4 = await client.post(
        f"/api/registrations/{registration_id}/transactions",
        json={"kind": "correction", "amount": "5.00", "effective_date": "2026-02-02", "note": "Bank fee adjustment"},
        headers=ADMIN_HEADERS,
    )
    assert r4.status_code == 201, r4.text

    ledger = (await client.get(f"/api/registrations/{registration_id}/transactions", headers=ADMIN_HEADERS)).json()
    assert [t["kind"] for t in ledger] == ["payment", "payment", "refund", "correction"]

    # The original payment remains, unedited, alongside its reversal.
    original = next(t for t in ledger if t["id"] == first_id)
    assert original["amount"] == "60.00"
    assert original["reversed_transaction_id"] is None
    refund = next(t for t in ledger if t["kind"] == "refund")
    assert refund["reversed_transaction_id"] == first_id

    registration = (await client.get(f"/api/registrations/{registration_id}", headers=ADMIN_HEADERS)).json()
    ledger_sum = sum(Decimal(t["amount"]) for t in ledger)
    assert ledger_sum == Decimal("85.00")
    # Every reported total is traceable to the ledger: amount_paid is exactly
    # the sum of these entries.
    assert Decimal(registration["amount_paid"]) == ledger_sum
    assert registration["payment_status"] == "partial"


@pytest.mark.anyio
async def test_transaction_kind_amount_sign_is_validated(client):
    registration_id = await _registration(client, amount_due="10.00")

    for kind, amount in (("payment", "-5.00"), ("payment", "0.00"), ("refund", "5.00"), ("correction", "0.00")):
        r = await client.post(
            f"/api/registrations/{registration_id}/transactions",
            json={"kind": kind, "amount": amount, "effective_date": "2026-01-01"},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 400, (kind, amount, r.text)


@pytest.mark.anyio
async def test_reversed_transaction_id_must_belong_to_same_booking(client):
    other_registration_id = await _registration(client, amount_due="10.00")
    r = await client.post(
        f"/api/registrations/{other_registration_id}/transactions",
        json={"kind": "payment", "amount": "10.00", "effective_date": "2026-01-01"},
        headers=ADMIN_HEADERS,
    )
    other_transaction_id = r.json()["id"]

    registration_id = await _registration(client, amount_due="10.00")
    r = await client.post(
        f"/api/registrations/{registration_id}/transactions",
        json={
            "kind": "refund",
            "amount": "-5.00",
            "effective_date": "2026-01-02",
            "reversed_transaction_id": other_transaction_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400, r.text


@pytest.mark.anyio
async def test_deleting_a_booking_with_ledger_entries_is_rejected(client):
    registration_id = await _registration(client, amount_due="10.00")
    r = await client.post(
        f"/api/registrations/{registration_id}/transactions",
        json={"kind": "payment", "amount": "10.00", "effective_date": "2026-01-01"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.delete(f"/api/registrations/{registration_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 409, r.text


# ---------------------------------------------------------------------------
# CSV export (#1019 acceptance criteria: formula-injection safety)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_export_prefixes_formula_injection_reference_and_filters_by_edition(client):
    registration_id = await _registration(client, amount_due="10.00")
    r = await client.post(
        f"/api/registrations/{registration_id}/transactions",
        json={
            "kind": "payment",
            "amount": "10.00",
            "effective_date": "2026-03-01",
            "reference": "=cmd|'/c calc'!A1",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.get("/api/registrations/transactions/export", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert "'=cmd" in r.text

    r = await client.get(
        "/api/registrations/transactions/export",
        params={"edition_id": "does-not-exist"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert "cmd" not in r.text


# ---------------------------------------------------------------------------
# In-app ledger drill-down (#1019): GET /transactions, filtered and joined
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_transactions_filters_by_edition_and_person_with_booking_context(client):
    r = await client.post("/api/people", json={"name": "Drilldown Person"}, headers=ADMIN_HEADERS)
    person_id = r.json()["id"]
    own_registration_id = await _registration(client, amount_due="10.00", person_id=person_id)
    other_registration_id = await _registration(client, amount_due="10.00")

    r = await client.post(
        f"/api/registrations/{own_registration_id}/transactions",
        json={"kind": "payment", "amount": "10.00", "effective_date": "2026-01-01", "reference": "OWN-REF"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        f"/api/registrations/{other_registration_id}/transactions",
        json={"kind": "payment", "amount": "10.00", "effective_date": "2026-01-01", "reference": "OTHER-REF"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.get(
        "/api/registrations/transactions",
        params={"person_id": person_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    assert [row["reference"] for row in rows] == ["OWN-REF"]
    row = rows[0]
    assert row["person_name"] == "Drilldown Person"
    assert row["event_title"] == "Ledger Bourse"
    assert row["registration_id"] == own_registration_id
    assert row["edition_label"]

    r = await client.get(
        "/api/registrations/transactions",
        params={"edition_id": "does-not-exist"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json() == []


# ---------------------------------------------------------------------------
# Person-level payment summary and export filter (#1019)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_person_payment_summary_aggregates_across_bookings_and_excludes_cancelled(client):
    r = await client.post("/api/people", json={"name": "Summary Person"}, headers=ADMIN_HEADERS)
    person_id = r.json()["id"]

    reg1 = await _registration(client, amount_due="100.00", person_id=person_id)
    reg2 = await _registration(client, amount_due="50.00", person_id=person_id)
    cancelled_reg = await _registration(client, amount_due="200.00", person_id=person_id)

    r = await client.post(
        f"/api/registrations/{reg1}/transactions",
        json={"kind": "payment", "amount": "100.00", "effective_date": "2026-01-01"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        f"/api/registrations/{reg2}/transactions",
        json={"kind": "payment", "amount": "60.00", "effective_date": "2026-01-02"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        f"/api/registrations/{reg2}/transactions",
        json={"kind": "refund", "amount": "-10.00", "effective_date": "2026-01-03"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    # Fully paid on a booking that's since been cancelled: excluded from the
    # summary entirely, matching the edition stats' non-cancelled filter.
    r = await client.post(
        f"/api/registrations/{cancelled_reg}/transactions",
        json={"kind": "payment", "amount": "200.00", "effective_date": "2026-01-04"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    r = await client.put(
        f"/api/registrations/{cancelled_reg}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/people/{person_id}/payment-summary", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    summary = r.json()

    # reg1: paid 100 on a 100 due (exact). reg2: paid 60, refunded 10 -> net
    # 50 on a 50 due (also exact, since the refund brought it back down).
    assert Decimal(summary["received"]) == Decimal("160.00")
    assert Decimal(summary["refunded"]) == Decimal("10.00")
    assert Decimal(summary["net_paid"]) == Decimal("150.00")
    assert Decimal(summary["due"]) == Decimal("150.00")
    assert Decimal(summary["outstanding"]) == Decimal("0.00")
    assert Decimal(summary["refund_liability"]) == Decimal("0.00")


@pytest.mark.anyio
async def test_export_filters_by_person_id(client):
    r = await client.post("/api/people", json={"name": "Export Filter Person"}, headers=ADMIN_HEADERS)
    person_id = r.json()["id"]
    own_registration_id = await _registration(client, amount_due="10.00", person_id=person_id)
    other_registration_id = await _registration(client, amount_due="10.00")

    r = await client.post(
        f"/api/registrations/{own_registration_id}/transactions",
        json={"kind": "payment", "amount": "10.00", "effective_date": "2026-01-01", "reference": "OWN-REF"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        f"/api/registrations/{other_registration_id}/transactions",
        json={"kind": "payment", "amount": "10.00", "effective_date": "2026-01-01", "reference": "OTHER-REF"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.get(
        "/api/registrations/transactions/export",
        params={"person_id": person_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert "OWN-REF" in r.text
    assert "OTHER-REF" not in r.text


# ---------------------------------------------------------------------------
# Idempotency: replay, payload-mismatch conflict, actor isolation, scope
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_payment_transaction_idempotency_key_replays_result(client, db_session):
    registration_id = await _registration(client, amount_due="25.00")
    factory = mcp_session_factory(db_session)

    first = await mcp_payments.create_payment_transaction(
        factory,
        "admin-1",
        registration_id,
        kind="payment",
        amount=25.0,
        effective_date="2026-01-01",
        idempotency_key="pay-retry-key",
    )
    second = await mcp_payments.create_payment_transaction(
        factory,
        "admin-1",
        registration_id,
        kind="payment",
        amount=25.0,
        effective_date="2026-01-01",
        idempotency_key="pay-retry-key",
    )
    assert _normalize(first) == _normalize(second)

    rows = (
        (
            await db_session.execute(
                select(PaymentTransaction).where(PaymentTransaction.registration_id == registration_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1


@pytest.mark.anyio
async def test_create_payment_transaction_idempotency_key_reused_with_different_payload_conflicts(client, db_session):
    registration_id = await _registration(client, amount_due="25.00")
    factory = mcp_session_factory(db_session)

    await mcp_payments.create_payment_transaction(
        factory,
        "admin-1",
        registration_id,
        kind="payment",
        amount=25.0,
        effective_date="2026-01-01",
        idempotency_key="shared-key",
    )
    with pytest.raises(MCPToolError, match="different request"):
        await mcp_payments.create_payment_transaction(
            factory,
            "admin-1",
            registration_id,
            kind="payment",
            amount=30.0,
            effective_date="2026-01-01",
            idempotency_key="shared-key",
        )

    rows = (
        (
            await db_session.execute(
                select(PaymentTransaction).where(PaymentTransaction.registration_id == registration_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1


@pytest.mark.anyio
async def test_create_payment_transaction_idempotency_key_reused_by_different_actor_conflicts(client, db_session):
    registration_id = await _registration(client, amount_due="25.00")
    factory = mcp_session_factory(db_session)

    await mcp_payments.create_payment_transaction(
        factory,
        "admin-a",
        registration_id,
        kind="payment",
        amount=25.0,
        effective_date="2026-01-01",
        idempotency_key="actor-scoped-key",
    )
    with pytest.raises(MCPToolError, match="another actor"):
        await mcp_payments.create_payment_transaction(
            factory,
            "admin-b",
            registration_id,
            kind="payment",
            amount=25.0,
            effective_date="2026-01-01",
            idempotency_key="actor-scoped-key",
        )


@pytest.mark.anyio
async def test_create_payment_transaction_stores_idempotency_key_scoped_to_payments(client, db_session):
    registration_id = await _registration(client, amount_due="25.00")
    factory = mcp_session_factory(db_session)

    await mcp_payments.create_payment_transaction(
        factory,
        "admin-1",
        registration_id,
        kind="payment",
        amount=25.0,
        effective_date="2026-01-01",
        idempotency_key="scope-check-key",
    )
    row = (await db_session.execute(select(IdempotencyKey).where(IdempotencyKey.key == "scope-check-key"))).scalar_one()
    assert row.scope == "payments.record_transaction"


@pytest.mark.anyio
async def test_concurrent_first_use_of_same_idempotency_key_records_exactly_one_transaction(
    client, db_session, engine, monkeypatch
):
    """Two concurrent submissions with the same key: exactly one commits."""
    registration_id = await _registration(client, amount_due="25.00")

    import app.services.payments_service as payments_service_module

    first_checked = asyncio.Event()
    release_first = asyncio.Event()
    original_check = payments_service_module.check_idempotency_key
    paused = False

    async def pause_first_check(*args, **kwargs):
        nonlocal paused
        result = await original_check(*args, **kwargs)
        if not paused:
            paused = True
            first_checked.set()
            await release_first.wait()
        return result

    monkeypatch.setattr(payments_service_module, "check_idempotency_key", pause_first_check)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def attempt():
        async with session_factory() as session:
            registration = await registrations_service.get_registration_or_404(session, registration_id)
            try:
                return await payments_service.record_payment_transaction(
                    session,
                    registration,
                    kind="payment",
                    amount=Decimal("25.00"),
                    effective_date=datetime(2026, 1, 1, tzinfo=UTC).date(),
                    actor="admin-race",
                    idempotency_key="race-key",
                )
            except HTTPException as exc:
                return exc.status_code

    first_task = asyncio.create_task(attempt())
    await asyncio.wait_for(first_checked.wait(), timeout=2)
    second_task = asyncio.create_task(attempt())
    await asyncio.sleep(0.05)
    release_first.set()
    outcomes = await asyncio.wait_for(asyncio.gather(first_task, second_task), timeout=2)

    assert sum(isinstance(outcome, dict) for outcome in outcomes) == 1
    assert outcomes.count(409) == 1

    rows = (
        (
            await db_session.execute(
                select(PaymentTransaction).where(PaymentTransaction.registration_id == registration_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
