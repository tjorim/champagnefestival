"""One emailed login, with organization access derived from current contacts (#1192)."""

import pytest
from sqlalchemy import select

from app.auth import require_admin, require_volunteer
from app.main import app
from app.models import Organization, Person, User, VisitorSession
from tests.helpers import _post_registration


@pytest.fixture
async def manager(db_session, monkeypatch):
    import app.routers.visitor_auth as auth

    sent = []

    async def send(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(auth, "send_visitor_magic_link_email", send)
    person = Person(id="per-manager", name="Contact Manager", email=" Contact@Example.com ")
    other = Person(id="per-other", name="Other Contact", email="other@example.com")
    db_session.add_all([person, other])
    await db_session.flush()
    rows = [
        Organization(name="One", contact_person_id=person.id),
        Organization(name="Two", contact_person_id=person.id),
        Organization(name="Other", contact_person_id=other.id),
    ]
    db_session.add_all(rows)
    await db_session.commit()
    return person, rows, sent


async def login(client, manager, email="contact@example.com"):
    await client.post("/api/visitor-sessions/request", json={"email": email})
    return await client.post("/api/visitor-sessions/redeem", json={"token": manager[2][-1]["token"]})


async def test_one_link_unlocks_own_bookings_and_organizations(client, db_session, manager):
    reg = await _post_registration(client, email="contact@example.com")
    assert reg.status_code == 201
    response = await login(client, manager, email="CONTACT@example.com")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [reg.json()["id"]]
    assert "visitor_session" in response.cookies
    assert "organization_manager_session" not in response.cookies
    assert len((await db_session.scalars(select(VisitorSession))).all()) == 1
    assert [row["id"] for row in (await client.get("/api/me/registrations")).json()] == [reg.json()["id"]]
    organizations = await client.get("/api/me/organizations")
    assert organizations.headers["cache-control"] == "no-store"
    assert [row["name"] for row in organizations.json()] == ["One", "Two"]
    assert set(organizations.json()[0]) == {
        "id",
        "name",
        "type",
        "website",
        "active",
        "description_language",
        "description_nl",
        "description_fr",
        "description_en",
    }


async def test_live_contact_revocation_keeps_shared_login(client, db_session, manager):
    await login(client, manager)
    manager[1][0].contact_person_id = "per-other"
    manager[1][1].contact_person_id = None
    await db_session.commit()
    assert (await client.get("/api/me/organizations")).json() == []
    assert (await client.get("/api/visitor-sessions/status")).json()["authenticated"]
    manager[1][0].contact_person_id = manager[0].id
    manager[0].email = "changed@example.com"
    await db_session.commit()
    assert (await client.get("/api/me/organizations")).json() == []


async def test_unknown_identity_has_same_login_and_no_organizations(client, manager):
    known = await client.post("/api/visitor-sessions/request", json={"email": "contact@example.com"})
    unknown = await client.post("/api/visitor-sessions/request", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    await client.post("/api/visitor-sessions/redeem", json={"token": manager[2][-1]["token"]})
    assert (await client.get("/api/me/organizations")).json() == []


async def test_contact_without_email_does_not_match(client, db_session, manager):
    manager[0].email = ""
    await db_session.commit()
    await login(client, manager)
    assert (await client.get("/api/me/organizations")).json() == []


async def test_shared_sign_out_revokes_both_views(client, manager):
    await login(client, manager)
    for _ in range(2):
        assert (await client.post("/api/visitor-sessions/sign-out")).status_code == 204
    assert (await client.get("/api/me/organizations")).status_code == 401
    assert (await client.get("/api/me/registrations")).status_code == 401


async def test_staff_token_alone_does_not_prove_contact_email(client, manager):
    assert (
        await client.get("/api/me/organizations", headers={"Authorization": "Bearer admin-token"})
    ).status_code == 401


async def test_shared_email_session_never_grants_staff_access(client, manager):
    await login(client, manager)
    app.dependency_overrides.pop(require_admin)
    app.dependency_overrides.pop(require_volunteer)
    assert (await client.get("/api/people")).status_code == 401
    assert (await client.get("/api/me/volunteer")).status_code == 401


async def test_oidc_user_in_a_cookie_has_no_contact_access(client, db_session):
    from starlette.responses import Response

    from app.visitor_session import create_session

    user = User(id="usr-staff", oidc_subject="staff")
    db_session.add(user)
    await db_session.flush()
    response = Response()
    await create_session(db_session, response, user)
    await db_session.commit()
    cookie = response.headers["set-cookie"].split(";", 1)[0].split("=", 1)[1]
    client.cookies.set("visitor_session", cookie)
    assert (await client.get("/api/me/organizations")).json() == []


@pytest.mark.parametrize("roles", [["admin"], ["volunteer"], []])
async def test_oidc_verified_email_unlocks_contacts_regardless_of_role(client, db_session, manager, monkeypatch, roles):
    async def decode(_token):
        return {
            "sub": "staff-contact",
            "email": " CONTACT@Example.com ",
            "email_verified": True,
            "realm_access": {"roles": roles},
        }

    monkeypatch.setattr("app.visitor_session.decode_token", decode)
    response = await client.get("/api/me/organizations", headers={"Authorization": "Bearer oidc-token"})
    assert response.status_code == 200
    assert [row["name"] for row in response.json()] == ["One", "Two"]
    manager[0].email = "changed@example.com"
    await db_session.commit()
    revoked = await client.get("/api/me/organizations", headers={"Authorization": "Bearer oidc-token"})
    assert revoked.json() == []


@pytest.mark.parametrize("verified", [False, None, "true", 1])
async def test_oidc_unverified_email_cannot_unlock_contacts(client, manager, monkeypatch, verified):
    async def decode(_token):
        return {
            "sub": "staff-contact",
            "email": "contact@example.com",
            "email_verified": verified,
            "realm_access": {"roles": ["admin"]},
        }

    monkeypatch.setattr("app.visitor_session.decode_token", decode)
    response = await client.get("/api/me/organizations", headers={"Authorization": "Bearer oidc-token"})
    assert response.status_code == 200
    assert response.json() == []


async def test_oidc_identity_does_not_borrow_a_different_cookie_email(client, manager, monkeypatch):
    await login(client, manager)

    async def decode(_token):
        return {"sub": "other-user", "email": "other@example.com", "email_verified": True}

    monkeypatch.setattr("app.visitor_session.decode_token", decode)
    response = await client.get("/api/me/organizations", headers={"Authorization": "Bearer oidc-token"})
    assert [row["name"] for row in response.json()] == ["Other"]


async def test_service_account_email_does_not_grant_contact_access(client, manager, monkeypatch):
    async def decode(_token):
        return {
            "sub": "service-sub",
            "preferred_username": "service-account-app",
            "email": "contact@example.com",
            "email_verified": True,
        }

    monkeypatch.setattr("app.visitor_session.decode_token", decode)
    response = await client.get("/api/me/organizations", headers={"Authorization": "Bearer service-token"})
    assert response.json() == []
