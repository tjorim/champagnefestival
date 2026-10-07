"""One account for password and magic-link sign-in (#1209).

A Keycloak token with an explicitly verified email joins the matching
emailed-session identity. Roles stay in the token; nothing here stores them.
"""

import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import AuditEntry, Registration, User, VisitorMagicLink, VisitorSession
from app.services.users_service import resolve_oidc_user
from app.visitor_session import actor_for_user
from tests.helpers import _create_event, _post_registration

BEARER = {"Authorization": "Bearer oidc-token"}


@pytest.fixture
def emails(monkeypatch):
    import app.routers.visitor_auth as auth

    sent = {"links": [], "account": []}

    async def send_link(**kwargs):
        sent["links"].append(kwargs)
        return True

    async def send_account(**kwargs):
        sent["account"].append(kwargs)
        return True

    monkeypatch.setattr(auth, "send_visitor_magic_link_email", send_link)
    monkeypatch.setattr(auth, "send_account_sign_in_email", send_account)
    return sent


def token_for(monkeypatch, *, sub="kc-1", email="visitor@example.com", verified=True, roles=("admin",)):
    async def decode(_token):
        claims = {"sub": sub, "email_verified": verified, "realm_access": {"roles": list(roles)}}
        if email is not None:
            claims["email"] = email
        return claims

    monkeypatch.setattr("app.visitor_session.decode_token", decode)


async def email_login(client, emails, email="visitor@example.com"):
    await client.post("/api/visitor-sessions/request", json={"email": email})
    return await client.post("/api/visitor-sessions/redeem", json={"token": emails["links"][-1]["token"]})


async def user_count(db_session):
    return await db_session.scalar(select(func.count()).select_from(User))


async def test_keycloak_login_joins_the_email_account_and_keeps_data(client, db_session, emails, monkeypatch):
    reg = await _post_registration(client, email="visitor@example.com")
    await email_login(client, emails)
    email_user = await db_session.scalar(select(User))
    cookie_registrations = (await client.get("/api/me/registrations")).json()
    assert [row["id"] for row in cookie_registrations] == [reg.json()["id"]]

    token_for(monkeypatch)
    password_login = await client.get("/api/me/registrations", headers=BEARER)

    assert [row["id"] for row in password_login.json()] == [reg.json()["id"]]
    assert await user_count(db_session) == 1
    await db_session.refresh(email_user)
    assert email_user.oidc_subject == "kc-1"
    assert email_user.verified_email == "visitor@example.com"
    # The existing emailed session is preserved and still reaches the same account.
    assert (await client.get("/api/visitor-sessions/status")).json()["authenticated"]
    assert await db_session.scalar(select(func.count()).select_from(VisitorSession)) == 1
    entry = await db_session.scalar(select(AuditEntry).where(AuditEntry.action == "account_linked"))
    assert entry is not None and entry.resource_id == email_user.id and entry.actor == "kc-1"
    assert "visitor@example.com" not in str(entry.details)


async def test_account_is_the_same_whichever_method_signs_in_first(client, db_session, emails, monkeypatch):
    token_for(monkeypatch)
    reg = await _post_registration(client, email="visitor@example.com")
    await client.get("/api/me/registrations", headers=BEARER)
    keycloak_user = await db_session.scalar(select(User))
    assert keycloak_user.verified_email == "visitor@example.com"

    await client.post("/api/visitor-sessions/request", json={"email": "visitor@example.com"})
    assert emails["links"] == []  # linked address: no roleless app link is issued
    assert len(emails["account"]) == 1
    claimed = await client.post("/api/me/registrations/claim-verified-email", headers=BEARER)
    assert [row["id"] for row in claimed.json()] == [reg.json()["id"]]
    assert await user_count(db_session) == 1


async def test_two_existing_accounts_merge_without_losing_bookings_or_sessions(client, db_session, emails, monkeypatch):
    reg = await _post_registration(client, email="visitor@example.com")
    await email_login(client, emails)
    email_user = await db_session.scalar(select(User).where(User.verified_email == "visitor@example.com"))
    # An account that signed in with Keycloak before linking existed.
    db_session.add(User(id="usr-keycloak", oidc_subject="kc-1"))
    await db_session.commit()

    token_for(monkeypatch)
    response = await client.get("/api/me/registrations", headers=BEARER)

    assert [row["id"] for row in response.json()] == [reg.json()["id"]]
    users = (await db_session.scalars(select(User))).all()
    assert [(u.id, u.oidc_subject, u.verified_email) for u in users] == [
        ("usr-keycloak", "kc-1", "visitor@example.com")
    ]
    assert await db_session.scalar(select(Registration.user_id)) == "usr-keycloak"
    assert await db_session.scalar(select(VisitorSession.user_id)) == "usr-keycloak"
    assert email_user.id != "usr-keycloak"
    assert (await client.get("/api/me/registrations")).json()[0]["id"] == reg.json()["id"]
    entry = await db_session.scalar(select(AuditEntry).where(AuditEntry.action == "account_linked"))
    assert entry.details["merged_user_id"] == email_user.id
    assert entry.details["registrations_moved"] == 1


async def test_merge_never_moves_another_users_booking(client, db_session, emails, monkeypatch):
    event = await _create_event(client)
    mine = await _post_registration(client, event=event, email="visitor@example.com")
    theirs = await _post_registration(client, event=event, email="stranger@example.com")
    await email_login(client, emails)
    db_session.add(User(id="usr-stranger", verified_email="stranger@example.com"))
    await db_session.flush()
    stranger_registration = await db_session.get(Registration, theirs.json()["id"])
    stranger_registration.user_id = "usr-stranger"
    db_session.add(User(id="usr-keycloak", oidc_subject="kc-1"))
    await db_session.commit()

    token_for(monkeypatch)
    response = await client.get("/api/me/registrations", headers=BEARER)

    assert [row["id"] for row in response.json()] == [mine.json()["id"]]
    await db_session.refresh(stranger_registration)
    assert stranger_registration.user_id == "usr-stranger"


async def test_unverified_or_absent_token_email_never_links(client, db_session, emails, monkeypatch):
    await _post_registration(client, email="visitor@example.com")
    await email_login(client, emails)
    client.cookies.clear()

    token_for(monkeypatch, verified=False)
    assert (await client.get("/api/me/registrations", headers=BEARER)).json() == []
    token_for(monkeypatch, sub="kc-2", email=None)
    assert (await client.get("/api/me/registrations", headers=BEARER)).json() == []
    token_for(monkeypatch, sub="kc-3", verified="true")
    assert (await client.get("/api/me/registrations", headers=BEARER)).json() == []

    email_user = await db_session.scalar(select(User).where(User.verified_email == "visitor@example.com"))
    assert email_user.oidc_subject is None
    assert await user_count(db_session) == 4


async def test_another_keycloak_account_holding_the_address_is_not_taken_over(client, db_session, monkeypatch):
    db_session.add(User(id="usr-first", oidc_subject="kc-1", verified_email="shared@example.com"))
    await db_session.commit()
    token_for(monkeypatch, sub="kc-2", email="shared@example.com")

    assert (await client.get("/api/me/registrations", headers=BEARER)).status_code == 200

    first = await db_session.get(User, "usr-first")
    second = await db_session.scalar(select(User).where(User.oidc_subject == "kc-2"))
    assert first.verified_email == "shared@example.com"
    assert second.verified_email is None


async def test_conflicting_new_address_keeps_the_existing_link(client, db_session, monkeypatch):
    db_session.add(User(id="usr-holder", oidc_subject="kc-holder", verified_email="taken@example.com"))
    await db_session.commit()
    token_for(monkeypatch, sub="kc-1", email="old@example.com")
    await client.get("/api/me/registrations", headers=BEARER)

    token_for(monkeypatch, sub="kc-1", email="taken@example.com")
    await client.get("/api/me/registrations", headers=BEARER)

    user = await db_session.scalar(select(User).where(User.oidc_subject == "kc-1"))
    await db_session.refresh(user)
    assert user.verified_email == "old@example.com"
    assert (await db_session.get(User, "usr-holder")).verified_email == "taken@example.com"


async def test_changed_keycloak_email_drops_the_old_address(client, db_session, emails, monkeypatch):
    token_for(monkeypatch, email="old@example.com")
    await client.get("/api/me/registrations", headers=BEARER)
    keycloak_user = await db_session.scalar(select(User))

    token_for(monkeypatch, email="new@example.com")
    await client.get("/api/me/registrations", headers=BEARER)
    await db_session.refresh(keycloak_user)
    assert keycloak_user.verified_email == "new@example.com"

    # The released address now reaches a fresh email-only account, not this one.
    await _post_registration(client, email="old@example.com")
    await email_login(client, emails, email="old@example.com")
    users = (await db_session.scalars(select(User).where(User.verified_email == "old@example.com"))).all()
    assert len(users) == 1 and users[0].id != keycloak_user.id and users[0].oidc_subject is None


async def test_linked_address_gets_no_app_link_and_a_pending_link_is_refused(client, db_session, emails, monkeypatch):
    known = await client.post("/api/visitor-sessions/request", json={"email": "visitor@example.com"})
    pending_token = emails["links"][-1]["token"]
    token_for(monkeypatch)
    await client.get("/api/me/registrations", headers=BEARER)
    assert await db_session.scalar(select(func.count()).select_from(VisitorMagicLink)) == 0

    linked = await client.post("/api/visitor-sessions/request", json={"email": "visitor@example.com"})
    unknown = await client.post("/api/visitor-sessions/request", json={"email": "unknown@example.com"})

    assert known.json() == linked.json() == unknown.json()
    assert len(emails["links"]) == 2  # only the first request and the unknown address
    assert len(emails["account"]) == 1
    assert "token" not in emails["account"][0]
    refused = await client.post("/api/visitor-sessions/redeem", json={"token": pending_token})
    assert refused.status_code == 401


async def test_audit_provenance_follows_the_sign_in_method(db_session):
    user = User(id="usr-both", oidc_subject="kc-1", verified_email="both@example.com")
    assert actor_for_user(user, {"sub": "kc-1"}) == ("kc-1", None)
    assert actor_for_user(user, None) == ("usr-both", "visitor_session")
    assert actor_for_user(User(id="usr-email", verified_email="e@example.com"), None) == (
        "usr-email",
        "visitor_session",
    )


async def test_sign_out_of_email_session_leaves_keycloak_identity_intact(client, db_session, emails, monkeypatch):
    await _post_registration(client, email="visitor@example.com")
    await email_login(client, emails)
    token_for(monkeypatch)
    await client.get("/api/me/registrations", headers=BEARER)

    assert (await client.post("/api/visitor-sessions/sign-out")).status_code == 204

    assert (await client.get("/api/visitor-sessions/status")).json()["authenticated"] is False
    assert len((await client.get("/api/me/registrations", headers=BEARER)).json()) == 1
    assert (await client.get("/api/me/registrations")).status_code == 401


async def test_concurrent_first_logins_converge_on_one_account(db_session, engine, emails):
    db_session.add(User(id="usr-email", verified_email="race@example.com"))
    await db_session.commit()
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def login():
        async with factory() as session:
            return (await resolve_oidc_user(session, "kc-race", "race@example.com")).id

    ids = await asyncio.wait_for(asyncio.gather(login(), login(), login()), timeout=5)

    assert set(ids) == {"usr-email"}
    users = (await db_session.scalars(select(User))).all()
    assert [(u.id, u.oidc_subject) for u in users] == [("usr-email", "kc-race")]


async def test_concurrent_first_logins_with_a_new_subject_create_one_account(db_session, engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def login():
        async with factory() as session:
            return (await resolve_oidc_user(session, "kc-new", "new@example.com")).id

    ids = await asyncio.wait_for(asyncio.gather(login(), login()), timeout=5)

    assert len(set(ids)) == 1
    assert await user_count(db_session) == 1
