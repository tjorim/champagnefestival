"""Tests for #941's Web Push subscription lifecycle, rate limiting, and
admin test-send delivery (subscribe/unsubscribe validation, 404/410
retirement, retry-vs-terminal outcomes, and the retention sweep).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pywebpush import WebPushException
from sqlalchemy import select

from app.config import settings
from app.models import AuditEntry, OutboxJob, PushSubscription
from app.push import deliver_web_push_test
from app.services.push_service import cleanup_expired_subscriptions
from tests.helpers import ADMIN_HEADERS, _create_event


def _subscription_body(*, endpoint: str = "https://push.example.com/abc123", **overrides) -> dict:
    body = {
        "endpoint": endpoint,
        "keys": {"p256dh": "p256dh-key-value", "auth": "auth-key-value"},
        "locale": "en",
        "categories": ["system_test"],
        "event_ids": [],
    }
    body.update(overrides)
    return body


def _enable_vapid(monkeypatch) -> None:
    monkeypatch.setattr(settings, "vapid_public_key", "test-public-key")
    monkeypatch.setattr(settings, "vapid_private_key", "test-private-key")
    monkeypatch.setattr(settings, "vapid_subject", "mailto:test@example.com")


async def test_vapid_public_key_reports_disabled_when_not_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", "")
    monkeypatch.setattr(settings, "vapid_private_key", "")
    monkeypatch.setattr(settings, "vapid_subject", "")

    r = await client.get("/api/push/vapid-public-key")
    assert r.status_code == 200
    assert r.json() == {"public_key": "", "enabled": False}


async def test_vapid_public_key_reports_enabled_when_configured(client, monkeypatch):
    _enable_vapid(monkeypatch)
    r = await client.get("/api/push/vapid-public-key")
    assert r.json() == {"public_key": "test-public-key", "enabled": True}


async def test_subscribe_creates_new_subscription(client, db_session):
    r = await client.post("/api/push/subscriptions", json=_subscription_body())
    assert r.status_code == 201
    body = r.json()
    assert body["categories"] == ["system_test"]
    assert body["event_ids"] == []

    row = await db_session.get(PushSubscription, body["id"])
    assert row is not None
    assert row.endpoint == "https://push.example.com/abc123"
    assert row.locale == "en"


async def test_subscribe_upserts_by_endpoint(client, db_session):
    first = await client.post("/api/push/subscriptions", json=_subscription_body())
    assert first.status_code == 201

    second = await client.post(
        "/api/push/subscriptions",
        json=_subscription_body(categories=["system_test", "schedule_updates"], locale="fr"),
    )
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]

    rows = (await db_session.execute(select(PushSubscription))).scalars().all()
    assert len(rows) == 1
    assert rows[0].categories == ["system_test", "schedule_updates"]
    assert rows[0].locale == "fr"


async def test_subscribe_rejects_invalid_category_format(client):
    r = await client.post("/api/push/subscriptions", json=_subscription_body(categories=["Not Valid!"]))
    assert r.status_code == 400


async def test_subscribe_rejects_too_many_categories(client):
    r = await client.post(
        "/api/push/subscriptions", json=_subscription_body(categories=[f"cat_{i}" for i in range(11)])
    )
    assert r.status_code == 422


async def test_subscribe_rejects_unknown_event_id(client):
    r = await client.post("/api/push/subscriptions", json=_subscription_body(event_ids=["evt_nonexistent"]))
    assert r.status_code == 400


async def test_subscribe_accepts_valid_event_id(client):
    event = await _create_event(client)
    r = await client.post("/api/push/subscriptions", json=_subscription_body(event_ids=[event["id"]]))
    assert r.status_code == 201
    assert r.json()["event_ids"] == [event["id"]]


async def test_subscribe_rejects_non_https_endpoint(client):
    r = await client.post("/api/push/subscriptions", json=_subscription_body(endpoint="http://push.example.com/x"))
    assert r.status_code == 422


async def test_subscribe_is_rate_limited(client):
    for i in range(20):
        r = await client.post(
            "/api/push/subscriptions", json=_subscription_body(endpoint=f"https://push.example.com/rl-{i}")
        )
        assert r.status_code == 201
    limited = await client.post(
        "/api/push/subscriptions", json=_subscription_body(endpoint="https://push.example.com/rl-final")
    )
    assert limited.status_code == 429


async def test_unsubscribe_deletes_subscription(client, db_session):
    created = await client.post("/api/push/subscriptions", json=_subscription_body())
    subscription_id = created.json()["id"]

    r = await client.post("/api/push/subscriptions/unsubscribe", json={"endpoint": "https://push.example.com/abc123"})
    assert r.status_code == 204
    assert await db_session.get(PushSubscription, subscription_id) is None


async def test_unsubscribe_nonexistent_endpoint_is_a_noop(client):
    r = await client.post(
        "/api/push/subscriptions/unsubscribe", json={"endpoint": "https://push.example.com/never-existed"}
    )
    assert r.status_code == 204


async def test_test_send_requires_admin(unauth_client):
    r = await unauth_client.post("/api/push/test", json={"subscription_id": "psh_whatever"})
    assert r.status_code == 401


async def test_test_send_rejects_non_admin(forbidden_client):
    r = await forbidden_client.post("/api/push/test", json={"subscription_id": "psh_whatever"})
    assert r.status_code == 403


async def test_test_send_enqueues_outbox_job_and_is_audited(client, db_session):
    created = await client.post("/api/push/subscriptions", json=_subscription_body())
    subscription_id = created.json()["id"]

    r = await client.post("/api/push/test", json={"subscription_id": subscription_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    job = await db_session.get(OutboxJob, job_id)
    assert job is not None
    assert job.job_type == "web_push_test"
    assert job.resource_id == subscription_id

    audit = await db_session.scalar(
        select(AuditEntry).where(AuditEntry.action == "delivery_queued", AuditEntry.resource_id == subscription_id)
    )
    assert audit is not None


async def test_test_send_is_rate_limited(client):
    created = await client.post("/api/push/subscriptions", json=_subscription_body())
    subscription_id = created.json()["id"]

    for _ in range(10):
        r = await client.post("/api/push/test", json={"subscription_id": subscription_id}, headers=ADMIN_HEADERS)
        assert r.status_code == 202
    limited = await client.post("/api/push/test", json={"subscription_id": subscription_id}, headers=ADMIN_HEADERS)
    assert limited.status_code == 429


async def test_test_send_twice_enqueues_two_jobs(client):
    """Not retry-safe by design (docs/retry-safety.md): a deliberate repeat
    click sends another test rather than being deduplicated.
    """
    created = await client.post("/api/push/subscriptions", json=_subscription_body())
    subscription_id = created.json()["id"]

    first = await client.post("/api/push/test", json={"subscription_id": subscription_id}, headers=ADMIN_HEADERS)
    second = await client.post("/api/push/test", json={"subscription_id": subscription_id}, headers=ADMIN_HEADERS)
    assert first.status_code == second.status_code == 202
    assert first.json()["job_id"] != second.json()["job_id"]


async def test_deliver_web_push_test_disabled_without_vapid_config(db_session):
    db_session.add(
        PushSubscription(
            id="psh-disabled",
            endpoint="https://push.example.com/disabled",
            p256dh_key="p256dh",
            auth_key="auth",
            locale="en",
        )
    )
    await db_session.commit()

    assert await deliver_web_push_test("psh-disabled") is False


async def test_deliver_web_push_test_when_subscription_already_gone(monkeypatch):
    _enable_vapid(monkeypatch)
    assert await deliver_web_push_test("psh-does-not-exist") is True


async def test_deliver_web_push_test_success(db_session, monkeypatch):
    _enable_vapid(monkeypatch)
    db_session.add(
        PushSubscription(
            id="psh-success",
            endpoint="https://push.example.com/success",
            p256dh_key="p256dh",
            auth_key="auth",
            locale="en",
        )
    )
    await db_session.commit()

    import app.push as push_module

    calls = []
    monkeypatch.setattr(push_module, "_send_sync", lambda subscription, payload: calls.append(subscription.id))

    assert await deliver_web_push_test("psh-success") is True
    assert calls == ["psh-success"]
    assert await db_session.get(PushSubscription, "psh-success") is not None


@pytest.mark.parametrize("status_code", [404, 410])
async def test_deliver_web_push_test_retires_subscription_on_invalid_status(db_session, monkeypatch, status_code):
    _enable_vapid(monkeypatch)
    db_session.add(
        PushSubscription(
            id="psh-dead",
            endpoint="https://push.example.com/dead",
            p256dh_key="p256dh",
            auth_key="auth",
            locale="en",
        )
    )
    await db_session.commit()

    import app.push as push_module

    class FakeResponse:
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code

    def fake_send(subscription, payload):
        raise WebPushException("gone", response=FakeResponse(status_code))

    monkeypatch.setattr(push_module, "_send_sync", fake_send)

    assert await deliver_web_push_test("psh-dead") is True
    assert await db_session.get(PushSubscription, "psh-dead") is None


async def test_deliver_web_push_test_retries_on_other_failure(db_session, monkeypatch):
    _enable_vapid(monkeypatch)
    db_session.add(
        PushSubscription(
            id="psh-flaky",
            endpoint="https://push.example.com/flaky",
            p256dh_key="p256dh",
            auth_key="auth",
            locale="en",
        )
    )
    await db_session.commit()

    import app.push as push_module

    class FakeResponse:
        status_code = 500

    def fake_send(subscription, payload):
        raise WebPushException("server error", response=FakeResponse())

    monkeypatch.setattr(push_module, "_send_sync", fake_send)

    assert await deliver_web_push_test("psh-flaky") is False
    # Not retired — a transient push-service error is retried, not terminal.
    assert await db_session.get(PushSubscription, "psh-flaky") is not None


async def test_cleanup_expired_subscriptions_removes_only_stale_rows(db_session):
    now = datetime.now(UTC)
    db_session.add_all(
        [
            PushSubscription(
                id="psh-stale",
                endpoint="https://push.example.com/stale",
                p256dh_key="p",
                auth_key="a",
                locale="en",
                last_seen_at=now - timedelta(days=settings.push_subscription_expiry_days + 1),
            ),
            PushSubscription(
                id="psh-fresh",
                endpoint="https://push.example.com/fresh",
                p256dh_key="p",
                auth_key="a",
                locale="en",
                last_seen_at=now,
            ),
        ]
    )
    await db_session.commit()

    deleted = await cleanup_expired_subscriptions(db_session)

    assert deleted == 1
    remaining = (await db_session.execute(select(PushSubscription.id))).scalars().all()
    assert remaining == ["psh-fresh"]
