"""Members-only public writes require verified current membership (#1404)."""

import pytest
from sqlalchemy import select

from app.models import Person, Registration
from tests.helpers import ADMIN_HEADERS, _create_event, _post_registration
from tests.test_visitor_sessions import _capture_sent_token
from tests.test_waitlist import SUBMISSION_ID, _create_sold_out_product


@pytest.mark.parametrize("state", ["current", "wrong_email", "retired", "anonymised", "anonymous"])
async def test_member_gate(client, db_session, monkeypatch, state):
    event = await _create_event(client)
    response = await client.put(f"/api/events/{event['id']}", headers=ADMIN_HEADERS, json={"members_only": True})
    assert response.status_code == 200
    assert response.json()["members_only"] is True
    person = (
        await client.post(
            "/api/members", headers=ADMIN_HEADERS, json={"name": "Real member", "email": "member@example.com"}
        )
    ).json()
    stored = await db_session.get(Person, person["id"])
    if state == "retired":
        stored.retired_roles = {"member": "2026-10-24"}
    if state == "anonymised":
        stored.anonymised = True
    await db_session.commit()
    product = await _create_sold_out_product(client, event_id=event["id"])
    if state != "anonymous":
        tokens = _capture_sent_token(monkeypatch)
        email = "other@example.com" if state == "wrong_email" else "member@example.com"
        await client.post("/api/visitor-sessions/request", json={"email": email})
        assert (await client.post("/api/visitor-sessions/redeem", json={"token": tokens[-1]})).status_code == 200
    booking = await _post_registration(client, event=event, name="Different name", email="untrusted@example.com")
    waitlist = await client.post(
        "/api/waitlist",
        json={
            "submission_id": SUBMISSION_ID,
            "product_id": product,
            "name": "Different name",
            "email": "untrusted@example.com",
        },
    )
    if state == "current":
        assert booking.status_code == 201, booking.text
        assert waitlist.status_code == 200, waitlist.text
        registration = await db_session.scalar(select(Registration).where(Registration.id == booking.json()["id"]))
        assert registration.person_id == person["id"]
        assert registration.user_id is not None
    else:
        code = "member_sign_in_required" if state == "anonymous" else "membership_required"
        assert booking.json()["code"] == code, booking.text
        assert waitlist.json()["code"] == code, waitlist.text


async def test_switch_keeps_existing_registrations(client):
    event = await _create_event(client)
    booking = await _post_registration(client, event=event)
    assert booking.status_code == 201
    response = await client.put(f"/api/events/{event['id']}", headers=ADMIN_HEADERS, json={"members_only": True})
    assert response.status_code == 200
    response = await client.get(f"/api/registrations/{booking.json()['id']}", headers=ADMIN_HEADERS)
    assert response.status_code == 200


async def test_admin_bypass_and_mcp_switch(client, db_session):
    from app.mcp.admin.events import update_event
    from tests.helpers import mcp_session_factory
    from tests.test_audit import _create_admin_registration

    event = await _create_event(client)
    result = await update_event(mcp_session_factory(db_session), "test-admin", event["id"], members_only=True)
    assert result["members_only"] is True
    booking, _event = await _create_admin_registration(client, event=event)
    assert booking["event_id"] == event["id"]
    result = await update_event(mcp_session_factory(db_session), "test-admin", event["id"], members_only=False)
    assert result["members_only"] is False
    schemas = (await client.get("/openapi.json")).json()["components"]["schemas"]
    for name in ("EventCreate", "EventUpdate", "EventOut", "EventPublicOut"):
        assert "members_only" in schemas[name]["properties"]
