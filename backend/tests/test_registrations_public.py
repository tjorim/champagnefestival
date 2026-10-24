"""Tests for public registration creation endpoint."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.auth import get_optional_claims
from app.main import app
from app.models import EmailConsent, EmailConsentConfirmation, OutboxJob, Registration, User
from tests.helpers import (
    ADMIN_HEADERS,
    VENUE_PAYLOAD,
    _create_event,
    _post_registration,
    _registration_body,
)


@pytest.mark.anyio
async def test_create_reservation(client, db_session):
    r = await _post_registration(client)
    assert r.status_code == 201
    data = r.json()
    assert data["person"]["name"] == "Jean Dupont"
    assert data["status"] == "pending"
    assert "check_in_token" not in data  # must not be returned here
    job = await db_session.scalar(select(OutboxJob).where(OutboxJob.resource_id == data["id"]))
    assert job is not None
    assert job.job_type == "registration_confirmation"
    assert job.state == "pending"


@pytest.mark.anyio
async def test_create_reservation_checkout_summary_hides_admin_product_data(client):
    """The just-created booking's echoed `event.products` (#1020) exposes only
    the purchasable product the visitor could pick, with no `stock`, and
    never a hidden product also configured on this event."""
    event = await _create_event(client)
    purchasable = (
        await client.post(
            "/api/products",
            json={
                "event_id": event["id"],
                "name_nl": "Bottle",
                "price": "25.00",
                "category": "champagne",
            },
            headers=ADMIN_HEADERS,
        )
    ).json()
    hidden = (
        await client.post(
            "/api/products",
            json={
                "event_id": event["id"],
                "name_nl": "Kitchen Supply",
                "price": "1.00",
                "category": "other",
                "purchasable": False,
            },
            headers=ADMIN_HEADERS,
        )
    ).json()

    r = await _post_registration(client, event=event, order_items=[{"product_id": purchasable["id"], "quantity": 1}])
    assert r.status_code == 201, r.text
    products = {p["id"]: p for p in r.json()["event"]["products"]}
    assert purchasable["id"] in products
    assert "stock" not in products[purchasable["id"]]
    assert hidden["id"] not in products


@pytest.mark.anyio
async def test_authenticated_create_assigns_registration_owner(client, db_session):
    app.dependency_overrides[get_optional_claims] = lambda: {"sub": "booking-owner"}
    try:
        response = await _post_registration(client)
    finally:
        app.dependency_overrides.pop(get_optional_claims, None)

    assert response.status_code == 201
    user = await db_session.scalar(select(User).where(User.oidc_subject == "booking-owner"))
    assert user is not None
    registration = await db_session.get(Registration, response.json()["id"])
    assert registration is not None
    assert registration.user_id == user.id


@pytest.mark.anyio
async def test_create_reservation_rejects_event_without_public_registrations(client):
    event = await _create_event(client, registration_required=False)

    r = await client.post(
        "/api/registrations",
        json=_registration_body(event),
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "This event does not accept registrations."


@pytest.mark.anyio
async def test_create_reservation_rejects_registrations_before_opening(client):
    event = await _create_event(client, registrations_open_from="2099-03-22T00:00:00+00:00")

    r = await client.post(
        "/api/registrations",
        json=_registration_body(event),
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "Registrations for this event are not open yet."


@pytest.mark.anyio
async def test_create_reservation_rejects_inactive_event(client):
    event = await _create_event(client, event_active=False)

    r = await client.post(
        "/api/registrations",
        json=_registration_body(event),
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "Registrations are not available for this event."


@pytest.mark.anyio
async def test_event_rejects_registration_window_without_registration_required(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]
    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-event-validation",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    r = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-event-validation",
            "title_nl": "Walk-in Only Event",
            "date": "2099-03-21",
            "start_time": "18:00",
            "end_time": "22:00",
            "category": "general",
            "registration_required": False,
            "registrations_open_from": "2099-03-20T00:00:00+00:00",
        },
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "registrations_open_from may only be set when registration_required is true."


@pytest.mark.anyio
async def test_honeypot_rejected(client):
    event = await _create_event(client)
    body = _registration_body(event, honeypot="bot-value")
    r = await client.post("/api/registrations", json=body)
    assert r.status_code == 400
    assert r.json()["detail"] == "Submission rejected."


@pytest.mark.anyio
async def test_spam_invalid_timestamp(client):
    """A non-ISO form_start_time is rejected (bot protection)."""
    event = await _create_event(client)
    r = await client.post(
        "/api/registrations",
        json=_registration_body(event, form_start_time="1234567890"),
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Submission rejected."


@pytest.fixture()
def sent_confirmations(monkeypatch):
    """Capture the consent confirmation mails the registration route would send."""
    import app.routers.registrations as registrations_module

    sent: list[dict] = []

    async def fake_send(*, email, token, category_name, language):
        sent.append({"email": email, "token": token, "category_name": category_name, "language": language})
        return True

    monkeypatch.setattr(registrations_module, "send_email_consent_confirmation", fake_send)
    return sent


async def _open_consents(db_session, person_id: str) -> list[EmailConsent]:
    return list(
        (
            await db_session.scalars(
                select(EmailConsent).where(EmailConsent.person_id == person_id, EmailConsent.revoked_at.is_(None))
            )
        ).all()
    )


@pytest.mark.anyio
async def test_updates_option_defaults_to_no_consent_and_no_mail(client, db_session, sent_confirmations):
    event = await _create_event(client)
    r = await client.post("/api/registrations", json=_registration_body(event))
    assert r.status_code == 201, r.text
    assert await _open_consents(db_session, r.json()["person_id"]) == []
    assert await db_session.scalar(select(EmailConsentConfirmation.id)) is None
    assert sent_confirmations == []


@pytest.mark.anyio
async def test_updates_option_from_an_unverified_visitor_waits_for_email_confirmation(
    client, db_session, sent_confirmations
):
    event = await _create_event(client)
    r = await client.post(
        "/api/registrations",
        json=_registration_body(event, new_editions_opt_in=True, preferred_language="fr"),
    )
    assert r.status_code == 201, r.text
    person_id = r.json()["person_id"]

    # Anyone can type someone else's address: ticking the box is not consent yet.
    assert await _open_consents(db_session, person_id) == []
    [mail] = sent_confirmations
    assert mail["email"] == "jean@example.com"
    assert mail["language"] == "fr"
    assert mail["category_name"] == "Nouvelle édition du festival"

    # Only the hash of the token is stored.
    confirmation = await db_session.scalar(select(EmailConsentConfirmation))
    assert confirmation is not None and confirmation.token_hash != mail["token"]

    r = await client.post("/api/email-consents/confirm", json={"token": mail["token"]})
    assert r.status_code == 200, r.text
    assert r.json()["category_key"] == "new_editions"
    [consent] = await _open_consents(db_session, person_id)
    assert consent.category_key == "new_editions"
    assert consent.source == "registration_form"

    # The link works once; replaying it after a withdrawal must not re-grant.
    r = await client.post("/api/email-consents/confirm", json={"token": mail["token"]})
    assert r.status_code == 404
    assert r.json()["code"] == "consent_confirmation_invalid"


@pytest.mark.anyio
async def test_updates_option_with_the_signed_in_verified_address_is_consent_at_once(
    client, db_session, sent_confirmations, monkeypatch
):
    from tests.test_visitor_sessions import _capture_sent_token

    tokens = _capture_sent_token(monkeypatch)
    event = await _create_event(client)
    await client.post("/api/visitor-sessions/request", json={"email": "jean@example.com"})
    assert (await client.post("/api/visitor-sessions/redeem", json={"token": tokens[-1]})).status_code == 200

    r = await client.post("/api/registrations", json=_registration_body(event, new_editions_opt_in=True))
    assert r.status_code == 201, r.text

    [consent] = await _open_consents(db_session, r.json()["person_id"])
    assert consent.source == "registration_form"
    assert sent_confirmations == []
    assert await db_session.scalar(select(EmailConsentConfirmation.id)) is None


@pytest.mark.anyio
async def test_updates_option_with_a_different_verified_address_still_needs_confirmation(
    client, db_session, sent_confirmations, monkeypatch
):
    from tests.test_visitor_sessions import _capture_sent_token

    tokens = _capture_sent_token(monkeypatch)
    event = await _create_event(client)
    await client.post("/api/visitor-sessions/request", json={"email": "someone-else@example.com"})
    assert (await client.post("/api/visitor-sessions/redeem", json={"token": tokens[-1]})).status_code == 200

    r = await client.post("/api/registrations", json=_registration_body(event, new_editions_opt_in=True))
    assert r.status_code == 201, r.text

    assert await _open_consents(db_session, r.json()["person_id"]) == []
    assert len(sent_confirmations) == 1


@pytest.mark.anyio
async def test_updates_option_does_not_mail_the_same_person_again_within_the_hour(
    client, db_session, sent_confirmations
):
    event = await _create_event(client)
    for _ in range(3):
        r = await client.post("/api/registrations", json=_registration_body(event, new_editions_opt_in=True))
        assert r.status_code == 201, r.text

    assert len(sent_confirmations) == 1
    assert len((await db_session.scalars(select(EmailConsentConfirmation))).all()) == 1


@pytest.mark.anyio
async def test_unticked_box_never_revokes_a_consent_already_given(client, db_session, sent_confirmations):
    event = await _create_event(client)
    r = await client.post("/api/registrations", json=_registration_body(event, new_editions_opt_in=True))
    person_id = r.json()["person_id"]
    await client.post("/api/email-consents/confirm", json={"token": sent_confirmations[0]["token"]})

    r = await client.post("/api/registrations", json=_registration_body(event, new_editions_opt_in=False))
    assert r.status_code == 201, r.text
    assert r.json()["person_id"] == person_id
    assert len(await _open_consents(db_session, person_id)) == 1


@pytest.mark.anyio
async def test_confirmation_link_is_rejected_after_it_expires(client, db_session, sent_confirmations):
    event = await _create_event(client)
    await client.post("/api/registrations", json=_registration_body(event, new_editions_opt_in=True))
    confirmation = await db_session.scalar(select(EmailConsentConfirmation))
    confirmation.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    r = await client.post("/api/email-consents/confirm", json={"token": sent_confirmations[0]["token"]})
    assert r.status_code == 404
    assert await db_session.scalar(select(EmailConsent.id)) is None


@pytest.mark.anyio
async def test_confirmation_answers_with_the_category_name_in_the_requested_language(client, sent_confirmations):
    event = await _create_event(client)
    await client.post("/api/registrations", json=_registration_body(event, new_editions_opt_in=True))

    r = await client.post("/api/email-consents/confirm", json={"token": sent_confirmations[0]["token"], "locale": "fr"})
    assert r.status_code == 200, r.text
    assert r.json()["category_name"] == "Nouvelle édition du festival"


@pytest.mark.anyio
async def test_member_registering_with_the_updates_option_consents_directly(
    client, db_session, sent_confirmations, monkeypatch
):
    """The members-only gate attaches the booking to the signed-in member, whose address is verified."""
    from tests.test_visitor_sessions import _capture_sent_token

    tokens = _capture_sent_token(monkeypatch)
    event = await _create_event(client)
    await client.put(f"/api/events/{event['id']}", headers=ADMIN_HEADERS, json={"members_only": True})
    member = (
        await client.post(
            "/api/members", headers=ADMIN_HEADERS, json={"name": "Real member", "email": "member@example.com"}
        )
    ).json()
    await client.post("/api/visitor-sessions/request", json={"email": "member@example.com"})
    assert (await client.post("/api/visitor-sessions/redeem", json={"token": tokens[-1]})).status_code == 200

    r = await client.post(
        "/api/registrations",
        json=_registration_body(event, name="Typed differently", email="typed@example.com", new_editions_opt_in=True),
    )
    assert r.status_code == 201, r.text
    assert r.json()["person_id"] == member["id"]

    [consent] = await _open_consents(db_session, member["id"])
    assert consent.category_key == "new_editions"
    assert sent_confirmations == []
