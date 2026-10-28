"""The membership summary discloses only the verified caller's active state."""

import pytest

from app.main import app
from app.models import Person, User
from app.visitor_session import get_current_user_with_claims


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("roles", "retired", "anonymised", "expected"),
    [
        (["member"], {}, False, "active"),
        (["member"], {"member": "2026-01-01"}, False, "inactive"),
        (["member"], {}, True, "inactive"),
        (["volunteer", "admin"], {}, False, "inactive"),
    ],
)
async def test_membership_uses_active_directory_state(me_client, db_session, roles, retired, anonymised, expected):
    user = User(id="membership-user", oidc_subject="membership-sub", verified_email="other@example.com")
    db_session.add_all(
        [
            user,
            Person(
                id="membership-person",
                name="Member",
                email=" Member@Example.com ",
                roles=roles,
                retired_roles=retired,
                anonymised=anonymised,
            ),
        ]
    )
    await db_session.commit()
    app.dependency_overrides[get_current_user_with_claims] = lambda: (
        user,
        {"email": "member@example.com", "email_verified": True},
    )
    response = await me_client.get("/api/me/membership")
    assert response.status_code == 200
    assert response.json() == {"state": expected}
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("claims", "expected"),
    [
        ({"email": "member@example.com", "email_verified": False}, "unavailable"),
        ({"preferred_username": "member@example.com"}, "unavailable"),
        ({"email": "other@example.com", "email_verified": True}, "inactive"),
        (None, "active"),
    ],
)
async def test_membership_never_borrows_stored_email_for_oidc(me_client, db_session, claims, expected):
    user = User(id="membership-user", oidc_subject="membership-sub", verified_email="member@example.com")
    db_session.add_all(
        [user, Person(id="membership-person", name="Member", email="member@example.com", roles=["member"])]
    )
    await db_session.commit()
    app.dependency_overrides[get_current_user_with_claims] = lambda: (user, claims)
    response = await me_client.get("/api/me/membership")
    assert response.json() == {"state": expected}


@pytest.mark.anyio
async def test_membership_requires_authentication(unauth_client):
    assert (await unauth_client.get("/api/me/membership")).status_code == 401
