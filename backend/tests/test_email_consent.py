"""Email categories and per-category consent (#1408)."""

from __future__ import annotations

import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.models import AuditEntry, EmailConsent, EmailConsentConfirmation, Person
from app.services.email_categories_service import DEFAULT_EMAIL_CATEGORIES
from app.services.email_consent_service import cleanup_expired_confirmations
from tests.helpers import ADMIN_HEADERS, _add_consent, _create_event, _post_registration
from tests.test_visitor_sessions import _capture_sent_token

PREFERENCES = "/api/me/email-preferences"


async def _sign_in(client, monkeypatch, email: str) -> None:
    tokens = _capture_sent_token(monkeypatch)
    await client.post("/api/visitor-sessions/request", json={"email": email})
    assert (await client.post("/api/visitor-sessions/redeem", json={"token": tokens[-1]})).status_code == 200


async def _person(client, **overrides) -> dict:
    body = {"name": "Ann Member", "email": "ann@example.com", **overrides}
    r = await client.post("/api/people", json=body, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    return r.json()


def _keys(preferences: dict) -> list[str]:
    return [category["key"] for category in preferences["categories"]]


# --- categories (admin) -------------------------------------------------------------------------------


async def test_default_categories_are_seeded_with_roles(client):
    r = await client.get("/api/email-categories?locale=fr", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    by_key = {category["key"]: category for category in r.json()}
    assert list(by_key) == ["club_news", "new_editions", "volunteer_news", "reward_ready"]
    assert by_key["club_news"]["allowed_roles"] == ["member"]
    assert by_key["new_editions"]["allowed_roles"] == []
    assert by_key["volunteer_news"]["allowed_roles"] == ["volunteer"]
    assert by_key["reward_ready"]["automatic"] is True
    assert by_key["club_news"]["automatic"] is False
    assert by_key["club_news"]["name"] == "Actualités du club"
    assert all(category["description_nl"] for category in by_key.values())


def test_migration_seeds_the_same_categories_as_the_test_defaults():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "010_membership_and_mailings.py"
    spec = importlib.util.spec_from_file_location("migration_010", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.DEFAULTS == DEFAULT_EMAIL_CATEGORIES


async def test_category_management_requires_admin(unauth_client):
    assert (await unauth_client.get("/api/email-categories")).status_code == 401
    assert (await unauth_client.post("/api/email-categories", json={})).status_code == 401


async def test_create_update_and_delete_a_category(client):
    body = {
        "key": "tastings",
        "name_nl": "Proeverijen",
        "description_nl": "Uitnodigingen voor proeverijen.",
        "allowed_roles": ["member", "member", "volunteer"],
        "sort_order": 50,
    }
    r = await client.post("/api/email-categories", json=body, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    assert r.json()["allowed_roles"] == ["member", "volunteer"]
    assert r.json()["automatic"] is False

    r = await client.post("/api/email-categories", json=body, headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert r.json()["code"] == "email_category_exists"

    r = await client.put(
        "/api/email-categories/tastings",
        json={"name_en": "Tastings", "allowed_roles": []},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["name_en"] == "Tastings"
    assert r.json()["name_nl"] == "Proeverijen"
    assert r.json()["allowed_roles"] == []

    r = await client.delete("/api/email-categories/tastings", headers=ADMIN_HEADERS)
    assert r.status_code == 204


async def test_category_texts_require_dutch(client):
    r = await client.post(
        "/api/email-categories", json={"key": "no_dutch", "name_en": "English only"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/email-categories",
        json={"key": "orphan_description", "name_nl": "Naam", "description_en": "No Dutch description"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422
    # A partial update is validated against the merged texts, so Dutch cannot be cleared.
    r = await client.put("/api/email-categories/club_news", json={"name_nl": ""}, headers=ADMIN_HEADERS)
    assert r.status_code == 400


async def test_category_cannot_gain_a_sending_capability_by_editing(client):
    r = await client.put("/api/email-categories/club_news", json={"automatic": True}, headers=ADMIN_HEADERS)
    assert r.status_code == 422
    r = await client.post(
        "/api/email-categories", json={"key": "extra", "name_nl": "Extra", "automatic": True}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 422


async def test_role_names_are_validated(client):
    r = await client.post(
        "/api/email-categories",
        json={"key": "bad_role", "name_nl": "Slecht", "allowed_roles": ["Not A Role"]},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422


async def test_categories_the_code_depends_on_cannot_be_deleted(client):
    for key in ("new_editions", "reward_ready"):
        r = await client.delete(f"/api/email-categories/{key}", headers=ADMIN_HEADERS)
        assert r.status_code == 409
        assert r.json()["code"] == "email_category_protected"


async def test_category_with_consent_history_cannot_be_deleted(client, db_session):
    person = await _person(client, roles=["volunteer"])
    await _add_consent(
        db_session, person["id"], "volunteer_news", revoked_at=datetime.now(UTC), revoked_source="self_service"
    )
    r = await client.delete("/api/email-categories/volunteer_news", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert r.json()["code"] == "email_category_in_use"


async def test_unknown_category_is_a_404(client):
    r = await client.put("/api/email-categories/missing", json={"sort_order": 1}, headers=ADMIN_HEADERS)
    assert r.status_code == 404
    assert r.json()["code"] == "email_category_not_found"


# --- self-service preferences ---------------------------------------------------------------------------


async def test_preferences_require_a_sign_in(client):
    assert (await client.get(PREFERENCES)).status_code == 401
    assert (await client.put(PREFERENCES, json={"consents": {"club_news": True}})).status_code == 401


async def test_everyone_starts_unsubscribed_and_sees_only_the_categories_their_roles_allow(client, monkeypatch):
    await _person(client)
    await _sign_in(client, monkeypatch, "ann@example.com")

    r = await client.get(PREFERENCES)
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    assert r.json()["email"] == "ann@example.com"
    assert _keys(r.json()) == ["new_editions"]
    assert r.json()["categories"][0]["consented"] is False


async def test_members_and_volunteers_see_their_own_categories(client, monkeypatch):
    await _person(client, roles=["member", "volunteer"])
    await _sign_in(client, monkeypatch, "ann@example.com")

    r = await client.get(f"{PREFERENCES}?locale=en")
    assert _keys(r.json()) == ["club_news", "new_editions", "volunteer_news", "reward_ready"]
    assert r.json()["categories"][0]["name"] == "Club news"


async def test_person_gives_and_withdraws_consent_keeping_history(client, db_session, monkeypatch):
    person = await _person(client, roles=["member"])
    await _sign_in(client, monkeypatch, "ann@example.com")

    r = await client.put(PREFERENCES, json={"consents": {"club_news": True}})
    assert r.status_code == 200, r.text
    state = {c["key"]: c for c in r.json()["categories"]}
    assert state["club_news"]["consented"] is True
    assert state["club_news"]["granted_at"] is not None
    assert state["new_editions"]["consented"] is False

    # Repeating converges: no second record.
    assert (await client.put(PREFERENCES, json={"consents": {"club_news": True}})).status_code == 200
    r = await client.get(f"/api/people/{person['id']}/email-consents", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1
    assert r.json()[0]["source"] == "self_service"

    r = await client.put(PREFERENCES, json={"consents": {"club_news": False}})
    assert {c["key"]: c["consented"] for c in r.json()["categories"]}["club_news"] is False

    # Granting again opens a new record; the first one stays as history.
    await client.put(PREFERENCES, json={"consents": {"club_news": True}})
    r = await client.get(f"/api/people/{person['id']}/email-consents", headers=ADMIN_HEADERS)
    assert [row["revoked_at"] is None for row in r.json()] == [True, False]
    assert r.json()[1]["revoked_source"] == "self_service"

    actions = (
        await db_session.scalars(select(AuditEntry.action).where(AuditEntry.action.like("email_consent_%")))
    ).all()
    assert sorted(actions) == ["email_consent_granted", "email_consent_granted", "email_consent_revoked"]


async def test_category_outside_the_persons_roles_is_refused_and_nothing_is_written(client, db_session, monkeypatch):
    await _person(client)
    await _sign_in(client, monkeypatch, "ann@example.com")

    r = await client.put(PREFERENCES, json={"consents": {"new_editions": True, "club_news": True}})
    assert r.status_code == 403
    assert r.json()["code"] == "email_category_unavailable"
    assert await db_session.scalar(select(EmailConsent.id)) is None

    r = await client.put(PREFERENCES, json={"consents": {"made_up": True}})
    assert r.status_code == 404
    assert r.json()["code"] == "email_category_not_found"


async def test_a_retired_role_stops_new_consent_but_the_existing_record_can_be_withdrawn(
    client, db_session, monkeypatch
):
    person = await _person(client, roles=["member"])
    await _sign_in(client, monkeypatch, "ann@example.com")
    await client.put(PREFERENCES, json={"consents": {"club_news": True}})

    r = await client.post(f"/api/members/{person['id']}/deactivate", headers=ADMIN_HEADERS)
    assert r.status_code == 204, r.text

    r = await client.get(PREFERENCES)
    state = {c["key"]: c for c in r.json()["categories"]}
    # The record stays (and can be withdrawn); categories the person never had are gone.
    assert state["club_news"]["consented"] is True
    assert "reward_ready" not in state

    r = await client.put(PREFERENCES, json={"consents": {"club_news": False}})
    assert r.status_code == 200
    r = await client.put(PREFERENCES, json={"consents": {"club_news": True}})
    assert r.status_code == 403


async def test_booking_ownership_does_not_expose_the_bookings_contact_address(client, db_session, monkeypatch):
    """Only the verified address counts, never a booking linked to the signed-in account."""
    await _sign_in(client, monkeypatch, "owner@example.com")
    booking = await _post_registration(client, email="someone-else@example.com")
    assert booking.status_code == 201, booking.text
    stored = await db_session.get(Person, booking.json()["person_id"])
    assert stored.email == "someone-else@example.com"

    r = await client.get(PREFERENCES)
    assert r.status_code == 200
    assert r.json()["categories"] == []
    r = await client.put(PREFERENCES, json={"consents": {"new_editions": True}})
    assert r.status_code == 403
    assert await db_session.scalar(select(EmailConsent.id)) is None


async def test_consent_is_recorded_on_the_person_who_holds_the_role(client, db_session, monkeypatch):
    guest = await _person(client, name="Guest Ann")
    member = await _person(client, name="Member Ann", roles=["member"])
    await _sign_in(client, monkeypatch, "ann@example.com")

    r = await client.put(PREFERENCES, json={"consents": {"club_news": True, "new_editions": True}})
    assert r.status_code == 200, r.text
    rows = {c.category_key: c.person_id for c in (await db_session.scalars(select(EmailConsent))).all()}
    assert rows == {"club_news": member["id"], "new_editions": member["id"]}
    assert guest["id"] not in rows.values()

    # Withdrawing reaches the record wherever it lives.
    await client.put(PREFERENCES, json={"consents": {"new_editions": False}})
    open_rows = (await db_session.scalars(select(EmailConsent).where(EmailConsent.revoked_at.is_(None)))).all()
    assert [c.category_key for c in open_rows] == ["club_news"]


async def test_withdrawing_cancels_a_pending_confirmation(client, db_session, monkeypatch):
    person = await _person(client)
    await _sign_in(client, monkeypatch, "ann@example.com")
    db_session.add(
        EmailConsentConfirmation(
            id="ecc_pending",
            person_id=person["id"],
            category_key="new_editions",
            token_hash="a" * 64,
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
    )
    await db_session.commit()

    r = await client.put(PREFERENCES, json={"consents": {"new_editions": False}})
    assert r.status_code == 200
    assert await db_session.scalar(select(EmailConsentConfirmation.id)) is None


async def test_sign_in_without_a_matching_person_has_no_preferences(client, monkeypatch):
    await _sign_in(client, monkeypatch, "unknown@example.com")
    r = await client.get(PREFERENCES)
    assert r.json() == {"email": "unknown@example.com", "categories": []}


# --- administrators ---------------------------------------------------------------------------------------


async def test_admin_can_record_an_opt_out_but_not_grant_consent(client, db_session):
    person = await _person(client, roles=["member"])
    await _add_consent(db_session, person["id"], "club_news")

    r = await client.post(f"/api/people/{person['id']}/email-consents/club_news/opt-out", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    [row] = r.json()
    assert row["category_key"] == "club_news"
    assert row["revoked_source"] == "admin"
    assert row["revoked_at"] is not None

    # Repeating changes and audits nothing more.
    before = len(
        (await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "email_consent_revoked"))).all()
    )
    r = await client.post(f"/api/people/{person['id']}/email-consents/club_news/opt-out", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    after = len(
        (await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "email_consent_revoked"))).all()
    )
    assert before == after == 1

    # There is no way to grant on someone's behalf: the removed flag is no longer accepted.
    r = await client.put(f"/api/people/{person['id']}", json={"marketing_opt_in": True}, headers=ADMIN_HEADERS)
    assert r.status_code == 422
    r = await client.post(f"/api/people/{person['id']}/email-consents", json={}, headers=ADMIN_HEADERS)
    assert r.status_code in (404, 405)


async def test_admin_opt_out_for_an_unknown_category_or_person(client):
    person = await _person(client)
    r = await client.post(f"/api/people/{person['id']}/email-consents/nope/opt-out", headers=ADMIN_HEADERS)
    assert r.status_code == 404
    assert r.json()["code"] == "email_category_not_found"
    r = await client.post("/api/people/missing/email-consents/club_news/opt-out", headers=ADMIN_HEADERS)
    assert r.status_code == 404


async def test_admin_consent_endpoints_require_admin(unauth_client):
    assert (await unauth_client.get("/api/people/anyone/email-consents")).status_code == 401
    assert (await unauth_client.post("/api/people/anyone/email-consents/club_news/opt-out")).status_code == 401


async def test_expired_confirmations_are_swept(client, db_session):
    person = await _person(client)
    for suffix, delta in (("old", -1), ("new", 1)):
        db_session.add(
            EmailConsentConfirmation(
                id=f"ecc_{suffix}",
                person_id=person["id"] if suffix == "old" else (await _person(client, email="b@example.com"))["id"],
                category_key="new_editions",
                token_hash=suffix[0] * 64,
                expires_at=datetime.now(UTC) + timedelta(days=delta),
            )
        )
    await db_session.commit()

    assert await cleanup_expired_confirmations(db_session) == 1
    assert (await db_session.scalars(select(EmailConsentConfirmation.id))).all() == ["ecc_new"]


async def test_deleting_a_person_removes_their_consent_records(client, db_session):
    event = await _create_event(client)
    del event
    person = await _person(client)
    await _add_consent(db_session, person["id"], "new_editions")
    r = await client.delete(f"/api/people/{person['id']}", headers=ADMIN_HEADERS)
    assert r.status_code == 204
    assert await db_session.scalar(select(EmailConsent.id)) is None


async def test_consent_kept_through_anonymisation_can_still_be_withdrawn_by_the_address_owner(
    client, db_session, monkeypatch
):
    person = await _person(client)
    await _add_consent(db_session, person["id"], "new_editions")
    r = await client.post(f"/api/people/{person['id']}/anonymise", headers=ADMIN_HEADERS)
    assert r.json()["email"] == "ann@example.com"

    await _sign_in(client, monkeypatch, "ann@example.com")
    r = await client.get(PREFERENCES)
    assert [(c["key"], c["consented"]) for c in r.json()["categories"]] == [("new_editions", True)]

    # The record can be ended, but an anonymised record never takes a new grant.
    r = await client.put(PREFERENCES, json={"consents": {"new_editions": False}})
    assert r.status_code == 200, r.text
    r = await client.put(PREFERENCES, json={"consents": {"new_editions": True}})
    assert r.status_code == 403
    r = await client.get(f"/api/people/{person['id']}/email-consents", headers=ADMIN_HEADERS)
    assert [row["revoked_source"] for row in r.json()] == ["self_service"]
