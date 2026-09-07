"""Tests for #942's central composer: draft lifecycle, the schedule/send
state transition, announcement-channel reuse, and push-channel delivery
generalized from #941's single admin test-send to a real audience.
"""

from __future__ import annotations

import pytest
from pywebpush import WebPushException
from sqlalchemy import select

from app.composer_delivery import deliver_composer_message_dispatch, deliver_composer_push
from app.config import settings
from app.models import Announcement, AuditEntry, ComposedMessage, OutboxJob
from tests.helpers import ADMIN_HEADERS


def _enable_vapid(monkeypatch) -> None:
    monkeypatch.setattr(settings, "vapid_public_key", "test-public-key")
    monkeypatch.setattr(settings, "vapid_private_key", "test-private-key")
    monkeypatch.setattr(settings, "vapid_subject", "mailto:test@example.com")


@pytest.fixture(autouse=True)
def _stub_composer_push_endpoint_as_public(monkeypatch):
    """See tests/test_push.py's identical fixture for why this patches the
    module-level function rather than global DNS resolution."""
    import app.composer_delivery as composer_delivery_module

    monkeypatch.setattr(composer_delivery_module, "_resolves_to_public_address", lambda hostname: True)


def _draft_body(**overrides) -> dict:
    body = {
        "title_nl": "Belangrijke mededeling",
        "title_en": "Important notice",
        "title_fr": "Avis important",
        "body_nl": "Het festival begint morgen.",
        "body_en": "The festival starts tomorrow.",
        "body_fr": "Le festival commence demain.",
        "level": "info",
        "channels": ["announcement", "push"],
    }
    body.update(overrides)
    return body


async def _create_subscription(client, *, endpoint: str, locale: str = "nl") -> str:
    r = await client.post(
        "/api/push/subscriptions",
        json={
            "endpoint": endpoint,
            "keys": {"p256dh": "p256dh-key", "auth": "auth-key"},
            "locale": locale,
        },
    )
    assert r.status_code == 201
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Draft lifecycle
# ---------------------------------------------------------------------------


async def test_create_draft_requires_admin(unauth_client):
    r = await unauth_client.post("/api/composer", json=_draft_body())
    assert r.status_code == 401


async def test_create_draft(client):
    r = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    assert r.status_code == 201
    body = r.json()
    assert body["state"] == "draft"
    assert body["channels"] == ["announcement", "push"]
    assert body["estimated_push_audience"] == 0


async def test_create_draft_rejects_missing_title(client):
    r = await client.post(
        "/api/composer",
        json=_draft_body(title_nl=None, title_en=None, title_fr=None),
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422


async def test_create_draft_rejects_empty_channels(client):
    r = await client.post("/api/composer", json=_draft_body(channels=[]), headers=ADMIN_HEADERS)
    assert r.status_code == 422


async def test_create_draft_rejects_duplicate_channels(client):
    r = await client.post("/api/composer", json=_draft_body(channels=["push", "push"]), headers=ADMIN_HEADERS)
    assert r.status_code == 422


async def test_estimated_push_audience_reflects_current_subscriber_count(client):
    await _create_subscription(client, endpoint="https://push.example.com/a")
    await _create_subscription(client, endpoint="https://push.example.com/b")

    r = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    assert r.json()["estimated_push_audience"] == 2


async def test_update_draft(client):
    created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]

    updated = await client.put(
        f"/api/composer/{message_id}",
        json={"title_nl": "Bijgewerkte titel"},
        headers=ADMIN_HEADERS,
    )
    assert updated.status_code == 200
    assert updated.json()["title_nl"] == "Bijgewerkte titel"
    assert updated.json()["title_en"] == "Important notice"


async def test_cannot_update_a_scheduled_message(client):
    created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    scheduled = await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    assert scheduled.status_code == 200

    r = await client.put(f"/api/composer/{message_id}", json={"title_nl": "Too late"}, headers=ADMIN_HEADERS)
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# Schedule / send transition
# ---------------------------------------------------------------------------


async def test_schedule_send_enqueues_dispatch_job(client, db_session):
    created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]

    r = await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["state"] == "scheduled"

    job = await db_session.scalar(
        select(OutboxJob).where(OutboxJob.job_type == "composer_message_dispatch", OutboxJob.resource_id == message_id)
    )
    assert job is not None


async def test_schedule_send_rejects_a_second_attempt(client):
    created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]

    first = await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    assert first.status_code == 200

    second = await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    assert second.status_code == 409


async def test_schedule_send_accepts_a_future_scheduled_at(client):
    created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]

    r = await client.post(
        f"/api/composer/{message_id}/schedule",
        json={"scheduled_at": "2099-01-01T12:00:00+00:00"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["scheduled_at"].startswith("2099-01-01")


async def test_schedule_send_is_rate_limited(client):
    for _ in range(10):
        created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
        r = await client.post(f"/api/composer/{created.json()['id']}/schedule", json={}, headers=ADMIN_HEADERS)
        assert r.status_code == 200
    created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    limited = await client.post(f"/api/composer/{created.json()['id']}/schedule", json={}, headers=ADMIN_HEADERS)
    assert limited.status_code == 429


# ---------------------------------------------------------------------------
# Dispatch handler: resolves audience, creates announcement, enqueues push jobs
# ---------------------------------------------------------------------------


async def test_dispatch_creates_announcement_and_publishes_it(client, db_session):
    created = await client.post("/api/composer", json=_draft_body(channels=["announcement"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)

    assert await deliver_composer_message_dispatch(message_id) is True

    message = await db_session.get(ComposedMessage, message_id)
    assert message.state == "sent"
    assert message.announcement_id is not None
    announcement = await db_session.get(Announcement, message.announcement_id)
    assert announcement.active is True
    assert announcement.text_nl == "Het festival begint morgen."


async def test_dispatch_resolves_push_audience_fresh_at_send_time(client, db_session):
    created = await client.post("/api/composer", json=_draft_body(channels=["push"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)

    # Subscriber added *after* scheduling — the snapshot must still include it,
    # since it's resolved at dispatch time, not schedule time (decision doc).
    subscription_id = await _create_subscription(client, endpoint="https://push.example.com/late-subscriber")

    assert await deliver_composer_message_dispatch(message_id) is True

    message = await db_session.get(ComposedMessage, message_id)
    assert message.state == "sent"
    assert message.push_audience_snapshot == [subscription_id]

    job = await db_session.scalar(
        select(OutboxJob).where(
            OutboxJob.job_type == "composer_message_push",
            OutboxJob.resource_id == f"{message_id}:{subscription_id}",
        )
    )
    assert job is not None


async def test_dispatch_is_a_noop_when_already_sent(client, db_session):
    created = await client.post("/api/composer", json=_draft_body(channels=["announcement"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(message_id)

    first_announcement_id = (await db_session.get(ComposedMessage, message_id)).announcement_id

    # A duplicate worker execution must not create a second announcement.
    assert await deliver_composer_message_dispatch(message_id) is True
    message = await db_session.get(ComposedMessage, message_id)
    assert message.announcement_id == first_announcement_id


async def test_dispatch_writes_a_top_level_audit_entry(client, db_session):
    created = await client.post("/api/composer", json=_draft_body(), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)

    await deliver_composer_message_dispatch(message_id)

    audit = await db_session.scalar(
        select(AuditEntry).where(AuditEntry.action == "composed_message_sent", AuditEntry.resource_id == message_id)
    )
    assert audit is not None


# ---------------------------------------------------------------------------
# Push delivery handler
# ---------------------------------------------------------------------------


async def test_deliver_composer_push_success(client, db_session, monkeypatch):
    _enable_vapid(monkeypatch)
    subscription_id = await _create_subscription(client, endpoint="https://push.example.com/deliver-me", locale="en")
    created = await client.post("/api/composer", json=_draft_body(channels=["push"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(message_id)

    import app.composer_delivery as composer_delivery_module

    calls = []
    monkeypatch.setattr(composer_delivery_module, "_send_sync", lambda subscription, payload: calls.append(payload))

    assert await deliver_composer_push(f"{message_id}:{subscription_id}") is True
    assert len(calls) == 1
    assert "Important notice" in calls[0]
    assert "The festival starts tomorrow." in calls[0]


async def test_deliver_composer_push_falls_back_to_dutch_for_missing_locale_text(client, db_session, monkeypatch):
    _enable_vapid(monkeypatch)
    subscription_id = await _create_subscription(client, endpoint="https://push.example.com/fr-sub", locale="fr")
    created = await client.post(
        "/api/composer",
        json=_draft_body(channels=["push"], title_fr=None, body_fr=None),
        headers=ADMIN_HEADERS,
    )
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(message_id)

    import app.composer_delivery as composer_delivery_module

    calls = []
    monkeypatch.setattr(composer_delivery_module, "_send_sync", lambda subscription, payload: calls.append(payload))

    assert await deliver_composer_push(f"{message_id}:{subscription_id}") is True
    assert "Belangrijke mededeling" in calls[0]


@pytest.mark.parametrize("status_code", [404, 410])
async def test_deliver_composer_push_retires_subscription_on_invalid_status(
    client, db_session, monkeypatch, status_code
):
    _enable_vapid(monkeypatch)
    subscription_id = await _create_subscription(client, endpoint="https://push.example.com/dead-sub")
    created = await client.post("/api/composer", json=_draft_body(channels=["push"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(message_id)

    import app.composer_delivery as composer_delivery_module

    class FakeResponse:
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code

    def fake_send(subscription, payload):
        raise WebPushException("gone", response=FakeResponse(status_code))

    monkeypatch.setattr(composer_delivery_module, "_send_sync", fake_send)

    from app.models import PushSubscription

    assert await deliver_composer_push(f"{message_id}:{subscription_id}") is True
    assert await db_session.get(PushSubscription, subscription_id) is None


async def test_deliver_composer_push_retries_on_other_failure(client, db_session, monkeypatch):
    _enable_vapid(monkeypatch)
    subscription_id = await _create_subscription(client, endpoint="https://push.example.com/flaky-sub")
    created = await client.post("/api/composer", json=_draft_body(channels=["push"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(message_id)

    import app.composer_delivery as composer_delivery_module

    class FakeResponse:
        status_code = 500

    def fake_send(subscription, payload):
        raise WebPushException("server error", response=FakeResponse())

    monkeypatch.setattr(composer_delivery_module, "_send_sync", fake_send)

    assert await deliver_composer_push(f"{message_id}:{subscription_id}") is False


async def test_deliver_composer_push_missing_message_or_subscription_is_a_noop(monkeypatch):
    _enable_vapid(monkeypatch)
    assert await deliver_composer_push("does-not-exist:also-does-not-exist") is True


# ---------------------------------------------------------------------------
# Per-channel results
# ---------------------------------------------------------------------------


async def test_push_result_counts_reflect_delivery_outcomes(client, engine, monkeypatch):
    """Aggregate counts read OutboxJob.state, which only ``process_one_job``
    (the real worker loop) updates — calling the delivery handler directly,
    as most tests above do, exercises the side effect but never touches
    job.state, so this test goes through the worker loop instead."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.services.outbox_service import process_one_job

    _enable_vapid(monkeypatch)
    await _create_subscription(client, endpoint="https://push.example.com/delivered")
    failed_id = await _create_subscription(client, endpoint="https://push.example.com/failed")

    created = await client.post("/api/composer", json=_draft_body(channels=["push"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(f"/api/composer/{message_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(message_id)

    import app.composer_delivery as composer_delivery_module

    class FakeResponse:
        status_code = 500

    def flaky_send(subscription, payload):
        if subscription.id == failed_id:
            raise WebPushException("server error", response=FakeResponse())

    monkeypatch.setattr(composer_delivery_module, "_send_sync", flaky_send)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    handlers = {"composer_message_push": deliver_composer_push}
    assert await process_one_job(factory, handlers) is True
    assert await process_one_job(factory, handlers) is True

    r = await client.get(f"/api/composer/{message_id}", headers=ADMIN_HEADERS)
    body = r.json()
    assert body["push_delivered_count"] == 1
    assert body["push_failed_count"] == 0  # not yet at max_attempts — still retried, so "pending"
    assert body["push_pending_count"] == 1


async def test_push_result_counts_do_not_leak_between_different_messages(client, engine, monkeypatch):
    """Guards the resource_id.startswith() boundary in composer_service.py's
    result-count query — a raw SQL LIKE pattern would misinterpret the
    underscores in make_id()'s own id format as single-character wildcards.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.services.outbox_service import process_one_job

    _enable_vapid(monkeypatch)
    await _create_subscription(client, endpoint="https://push.example.com/shared")

    first = await client.post("/api/composer", json=_draft_body(channels=["push"]), headers=ADMIN_HEADERS)
    first_id = first.json()["id"]
    await client.post(f"/api/composer/{first_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(first_id)

    second = await client.post("/api/composer", json=_draft_body(channels=["push"]), headers=ADMIN_HEADERS)
    second_id = second.json()["id"]
    await client.post(f"/api/composer/{second_id}/schedule", json={}, headers=ADMIN_HEADERS)
    await deliver_composer_message_dispatch(second_id)

    import app.composer_delivery as composer_delivery_module

    monkeypatch.setattr(composer_delivery_module, "_send_sync", lambda subscription, payload: None)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    handlers = {"composer_message_push": deliver_composer_push}
    # Only first_id's job is processed — second_id's own job for this
    # subscriber is left pending on purpose, to prove it isn't counted here.
    assert await process_one_job(factory, handlers) is True

    r = await client.get(f"/api/composer/{second_id}", headers=ADMIN_HEADERS)
    body = r.json()
    assert body["push_delivered_count"] == 0
    assert body["push_pending_count"] == 1
