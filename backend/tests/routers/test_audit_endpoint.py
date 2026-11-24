"""Tests for the audit log read endpoint."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD


@pytest.mark.anyio
async def test_audit_requires_auth(unauth_client):
    r = await unauth_client.get("/api/audit")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_audit_lists_entries_from_mutations(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    r = await client.get(
        "/api/audit", params={"resource_type": "venue", "resource_id": venue_id}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) == 1
    assert entries[0]["action"] == "venue_created"
    assert entries[0]["resource_type"] == "venue"
    assert entries[0]["resource_id"] == venue_id
    assert entries[0]["details"] == {"name": "Test Venue"}
    assert entries[0]["resource_name"] == "Test Venue"
    assert entries[0]["resource_exists"] is True

    await client.put(f"/api/venues/{venue_id}", json={"name": "Renamed Venue"}, headers=ADMIN_HEADERS)
    params = {"resource_id": venue_id, "action": "venue_created"}
    r = await client.get("/api/audit", params=params, headers=ADMIN_HEADERS)
    assert r.json()[0]["resource_name"] == "Renamed Venue"

    await client.put(f"/api/venues/{venue_id}", json={"active": False}, headers=ADMIN_HEADERS)
    deleted = await client.delete(f"/api/venues/{venue_id}", headers=ADMIN_HEADERS)
    assert deleted.status_code == 204, deleted.text
    r = await client.get("/api/audit", params=params, headers=ADMIN_HEADERS)
    assert r.json()[0]["resource_name"] == "Test Venue"
    assert r.json()[0]["resource_exists"] is False


@pytest.mark.anyio
async def test_audit_filters_by_action(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    await client.put(f"/api/venues/{venue_id}", json={"city": "Bredene"}, headers=ADMIN_HEADERS)

    r = await client.get(
        "/api/audit", params={"resource_id": venue_id, "action": "venue_updated"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) == 1
    assert entries[0]["action"] == "venue_updated"


@pytest.mark.anyio
async def test_audit_supports_pagination(client):
    for i in range(3):
        r = await client.post("/api/venues", json={"name": f"Paged Venue {i}"}, headers=ADMIN_HEADERS)
        assert r.status_code == 201

    r = await client.get("/api/audit", params={"resource_type": "venue", "limit": 2}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.anyio
async def test_audit_filters_by_timezone_naive_since_and_until(client):
    """A `since`/`until` query value without a UTC offset must not crash the comparison
    against the timezone-aware `timestamp` column."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    r = await client.get(
        "/api/audit",
        params={"resource_id": venue_id, "since": "2000-01-01T00:00:00", "until": "2100-01-01T00:00:00"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_audit_resource_types_lists_distinct_values(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201

    r = await client.get("/api/audit/resource-types", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert "venue" in r.json()


@pytest.mark.anyio
async def test_audit_actions_lists_distinct_values(client):
    for _ in range(2):
        r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
        assert r.status_code == 201

    r = await client.get("/api/audit/actions", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json().count("venue_created") == 1


@pytest.mark.anyio
async def test_audit_resolves_edition_and_signage_channel_names(client):
    venue = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    edition = await client.post(
        "/api/editions",
        json={
            "id": "audit-march-2027",
            "year": 2027,
            "month": "march",
            "venue_id": venue.json()["id"],
        },
        headers=ADMIN_HEADERS,
    )
    assert edition.status_code == 201, edition.text
    r = await client.get("/api/audit", params={"resource_type": "edition"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()[0]["resource_name"] == "March 2027"
    assert r.json()[0]["resource_exists"] is True

    channel = await client.post(
        "/api/signage/channels",
        json={"slug": "main-hall", "name": "Main Hall", "edition_id": edition.json()["id"]},
        headers=ADMIN_HEADERS,
    )
    assert channel.status_code == 201, channel.text
    r = await client.get("/api/audit", params={"resource_type": "signage_channels"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()[0]["resource_name"] == "Main Hall"
    assert r.json()[0]["resource_exists"] is True


@pytest.mark.anyio
async def test_read_time_actor_labels_are_shared_with_mcp_and_can_filter(client, db_session):
    from app.mcp.admin.audit import list_audit_entries
    from app.models import AuditEntry, IntegrationClient, Person, User
    from tests.helpers import mcp_session_factory

    db_session.add_all(
        [
            Person(id="person_actor", name="Alex Martin", user=User(id="usr_staff", oidc_subject="staff-subject")),
            Person(
                id="person_visitor",
                name="Sam Martin",
                email="sam@example.net",
                user=User(id="usr_visitor", verified_email="sam@example.net"),
            ),
            # A verified address alone names nobody: this account is not linked to the same-named person.
            Person(id="person_unlinked", name="Kim Martin", email="kim@example.net"),
            User(id="usr_unlinked", verified_email="kim@example.net"),
            Person(
                id="person_erased",
                name="Erased",
                user=User(id="usr_erased", oidc_subject="erased-subject"),
                anonymised=True,
            ),
            IntegrationClient(
                id="integration_actor",
                name="Door scanner",
                key_hash="placeholder",
                key_preview="abcdefgh",
                allowed_role="volunteer",
                created_by_actor="staff-subject",
            ),
        ]
    )
    actors = [
        ("staff-subject", "keycloak", "person", "Alex Martin"),
        ("usr_visitor", "visitor_session", "person", "Sam Martin"),
        ("usr_unlinked", "visitor_session", "visitor", None),
        ("integration:integration_actor", "integration", "integration", "Door scanner"),
        ("", "token", "visitor", None),
        ("192.0.2.5", "token", "visitor", None),
        ("migration:001_contact_messages", "keycloak", "system", None),
        ("erased-subject", "keycloak", "unknown", None),
    ]
    for index, (actor, source, _, _) in enumerate(actors):
        db_session.add(
            AuditEntry(
                id=f"audit-actor-{index}",
                actor=actor,
                auth_source=source,
                action="actor_test",
                resource_type="test",
                resource_id="actor-test",
            )
        )
    await db_session.commit()
    expected = {actor: {"kind": kind, "name": name} for actor, _, kind, name in actors}

    params = {"resource_id": "actor-test"}
    response = await client.get("/api/audit", params=params)
    assert response.status_code == 200, response.text
    assert {row["actor"]: row["actor_label"] for row in response.json()} == expected
    mcp = await list_audit_entries(mcp_session_factory(db_session), resource_id="actor-test")
    assert {row["actor"]: row["actor_label"] for row in mcp["entries"]} == expected

    options = await client.get("/api/audit/actors")
    assert options.status_code == 200, options.text
    assert options.json() == [
        {"actor": actor, "actor_label": expected[actor]}
        for actor in ["staff-subject", "integration:integration_actor", "usr_visitor"]
    ]
    filtered = await client.get("/api/audit", params=params | {"actor": "staff-subject"})
    assert [row["actor"] for row in filtered.json()] == ["staff-subject"]

    person = await db_session.get(Person, "person_actor")
    assert person is not None
    person.name = "Alex Renamed"
    await db_session.commit()
    refreshed = await client.get("/api/audit", params=params | {"actor": "staff-subject"})
    assert refreshed.json()[0]["actor_label"]["name"] == "Alex Renamed"
    assert refreshed.json()[0]["details"] == {}
