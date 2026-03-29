"""Tests for the people admin API, including person merge and members."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, _create_event, _post_registration

# ---------------------------------------------------------------------------
# People (admin)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_people_require_auth(client):
    r = await client.get("/api/people")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_people_crud_roles_and_filters(client):
    payload = {
        "name": "Anne Dupuis",
        "email": "anne@example.com",
        "phone": "+32470111222",
        "address": "Kapelstraat 8, Bredene",
        "roles": ["Chairwoman", "Volunteer", "Member"],
        "national_register_number": "85010199999",
        "eid_document_number": "BEI998877",
        "visits_per_month": 1,
        "club_name": "Champagne Lovers",
        "notes": "Often helps at entrance.",
        "active": True,
    }

    r = await client.post("/api/people", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    person = r.json()
    assert person["roles"] == ["chairwoman", "member", "volunteer"]

    person_id = person["id"]

    r = await client.get("/api/people", params={"role": "volunteer"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.get("/api/people", params={"q": "treasurer"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 0

    r = await client.put(
        f"/api/people/{person_id}",
        json={"roles": ["Treasurer", "Festival-Visitor"], "active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["roles"] == ["festival-visitor", "treasurer"]
    assert r.json()["active"] is False

    r = await client.get(
        "/api/people",
        params={"role": "treasurer", "active": "false"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    # Uncertain match (same email, different name) → new person created; admin sees duplicate.
    r = await _post_registration(
        client,
        path="/api/registrations",
        email="anne@example.com",
        name="A. Dupuis",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] != person_id

    r = await client.get(f"/api/people/{person_id}/registrations", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 0  # uncertain reservation belongs to the newly-created person

    r = await client.delete(f"/api/people/{person_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204


@pytest.mark.anyio
async def test_reservation_auto_links_certain_person(client):
    """Same email + same name (case/whitespace insensitive) → reservation links to existing person."""
    bob_phone = "+32470123456"
    r = await client.post(
        "/api/people",
        json={"name": "Bob Martin", "email": "bob@example.com", "phone": bob_phone},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    bob_id = r.json()["id"]

    event = await _create_event(client)

    # Exact match on email + phone + name → auto-link
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        email="bob@example.com",
        phone=bob_phone,
        name="Bob Martin",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == bob_id

    # Case/whitespace variation still matches
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        email="BOB@EXAMPLE.COM",
        phone=bob_phone,
        name="  bob  martin  ",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == bob_id

    # Different name → new person
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        email="bob@example.com",
        phone=bob_phone,
        name="Robert Martin",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] != bob_id

    # Exact match again after a different-name reservation was created → still links to bob_id
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        email="bob@example.com",
        phone=bob_phone,
        name="Bob Martin",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == bob_id

    # Different phone → new person (even if email + name match)
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        email="bob@example.com",
        name="Bob Martin",
        phone="+32499111111",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] != bob_id


@pytest.mark.anyio
async def test_person_reservations_include_event_payload(client):
    person = await client.post(
        "/api/people",
        json={"name": "Alice Event", "email": "alice.event@example.com"},
        headers=ADMIN_HEADERS,
    )
    assert person.status_code == 201
    person_id = person.json()["id"]

    event = await _create_event(client, edition_id="edition-person-reservations")
    reservation = await client.post(
        "/api/registrations/admin",
        json={
            "person_id": person_id,
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [],
            "notes": "",
            "accessibility_note": "",
            "status": "confirmed",
        },
        headers=ADMIN_HEADERS,
    )
    assert reservation.status_code == 201

    r = await client.get(f"/api/people/{person_id}/registrations", headers=ADMIN_HEADERS)

    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["event"]["id"] == event["id"]


@pytest.mark.anyio
async def test_normalize_phone_equivalent_inputs(client):
    """E.164-like normalization: +32 470..., 0032 470..., and 0470... all store as +32470123456."""
    base_phone_variants = [
        "+32 470 12 34 56",  # international with spaces
        "0032 470 12 34 56",  # IDD prefix 00
        "0470 12 34 56",  # local trunk 0
    ]
    canonical_phone = "+32470123456"

    # Create a person with the first variant
    r = await client.post(
        "/api/people",
        json={
            "name": "Phone Test",
            "email": "phonetest@example.com",
            "phone": base_phone_variants[0],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    person_id = r.json()["id"]
    assert r.json()["phone"] == canonical_phone

    event = await _create_event(client)

    # POST a reservation using the IDD variant → should link to the same person
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        email="phonetest@example.com",
        phone=base_phone_variants[1],
        name="Phone Test",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == person_id

    # POST a reservation using the local trunk variant → should also link to the same person
    r = await _post_registration(
        client,
        path="/api/registrations",
        event=event,
        email="phonetest@example.com",
        phone=base_phone_variants[2],
        name="Phone Test",
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == person_id

    # Update a person using a local variant → stored in canonical form
    r = await client.put(
        f"/api/people/{person_id}",
        json={
            "name": "Phone Test",
            "email": "phonetest@example.com",
            "phone": base_phone_variants[2],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["phone"] == canonical_phone


@pytest.mark.anyio
@pytest.mark.parametrize(
    "raw_phone,expected",
    [
        ("+32470123456", "+32470123456"),  # already E.164
        ("+32 470 12 34 56", "+32470123456"),  # E.164 with spaces
        ("0032 470 12 34 56", "+32470123456"),  # IDD 00 prefix
        ("0470 12 34 56", "+32470123456"),  # local trunk 0 (Belgian)
        ("+491701234567", "+491701234567"),  # German number with +
        ("+33612345678", "+33612345678"),  # French number with +
        ("0033 6 12 34 56 78", "+33612345678"),  # French with IDD 00
        ("", ""),  # empty string
    ],
)
async def test_parse_phone_valid_inputs(client, raw_phone, expected):
    """Valid phone numbers are stored in E.164 canonical form."""
    safe_id = "".join(c for c in raw_phone if c.isalnum()) or "empty"
    r = await client.post(
        "/api/people",
        json={"name": "Phone Tester", "email": f"ptest_{safe_id}@example.com", "phone": raw_phone},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.json()
    assert r.json()["phone"] == expected


@pytest.mark.anyio
@pytest.mark.parametrize(
    "bad_phone",
    [
        "not-a-number",
        "1234",  # too short to be valid
        "00",  # IDD prefix only — no number
    ],
)
async def test_parse_phone_invalid_inputs(client, bad_phone):
    """Invalid phone numbers are rejected with 422 Unprocessable Entity."""
    r = await client.post(
        "/api/people",
        json={"name": "Bad Phone", "email": "badphone@example.com", "phone": bad_phone},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422, r.json()


@pytest.mark.anyio
async def test_people_support_limit_and_page(client):
    created_ids: set[str] = set()
    for i, name in enumerate(("People Alpha", "People Bravo", "People Charlie")):
        r = await client.post(
            "/api/people",
            json={"name": name, "email": f"people{i}@example.com"},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        created_ids.add(r.json()["id"])

    first_page = await client.get("/api/people", params={"limit": 2, "page": 1}, headers=ADMIN_HEADERS)
    assert first_page.status_code == 200
    first_page_results = first_page.json()
    assert len(first_page_results) == 2

    second_page = await client.get("/api/people", params={"limit": 2, "page": 2}, headers=ADMIN_HEADERS)
    assert second_page.status_code == 200
    second_page_results = second_page.json()
    assert len(second_page_results) >= 1

    first_page_ids = {row["id"] for row in first_page_results}
    second_page_ids = {row["id"] for row in second_page_results}
    assert first_page_ids.isdisjoint(second_page_ids)

    # Ordering must be consistent with the unpaginated endpoint
    all_response = await client.get("/api/people", headers=ADMIN_HEADERS)
    assert all_response.status_code == 200
    all_results = [r for r in all_response.json() if r["id"] in created_ids]
    assert all_results[:2] == first_page_results
    assert all_results[2:3] == second_page_results


# ---------------------------------------------------------------------------
# People merge endpoint
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_merge_people_requires_auth(client):
    r = await client.post("/api/people/per_x/merge/per_y")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_merge_people_not_found(client):
    r = await client.post("/api/people/nonexistent/merge/also_nonexistent", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_merge_people_canonical_not_found(client):
    """404 when canonical person ID does not exist."""
    r = await client.post(
        "/api/people",
        json={"name": "Real Person", "email": "real@example.com"},
        headers=ADMIN_HEADERS,
    )
    duplicate_id = r.json()["id"]
    r = await client.post(f"/api/people/nonexistent/merge/{duplicate_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_merge_people_duplicate_not_found(client):
    """404 when duplicate person ID does not exist."""
    r = await client.post(
        "/api/people",
        json={"name": "Canon Only", "email": "canon.only@example.com"},
        headers=ADMIN_HEADERS,
    )
    canonical_id = r.json()["id"]
    r = await client.post(f"/api/people/{canonical_id}/merge/nonexistent", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_merge_people_self(client):
    r = await client.post(
        "/api/people",
        json={"name": "Alice", "email": "alice@example.com"},
        headers=ADMIN_HEADERS,
    )
    pid = r.json()["id"]
    r = await client.post(f"/api/people/{pid}/merge/{pid}", headers=ADMIN_HEADERS)
    assert r.status_code == 400


@pytest.mark.anyio
async def test_merge_people_repoints_reservations(client):
    """Reservations linked to duplicate are re-pointed to canonical after merge."""
    r = await client.post(
        "/api/people",
        json={
            "name": "Canon Person",
            "email": "canon@example.com",
            "phone": "+32470000001",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    canonical_id = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={
            "name": "Dup Person",
            "email": "dup@example.com",
            "phone": "+32470000002",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    dup_id = r.json()["id"]

    # Create a reservation linked to the duplicate
    event = await _create_event(client, edition_id="edition-merge-duplicate", title="Test")
    r = await client.post(
        "/api/registrations/admin",
        json={
            "person_id": dup_id,
            "event_id": event["id"],
            "event_title": event["title"],
            "guest_count": 1,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    res_id = r.json()["id"]

    # Merge dup into canonical
    r = await client.post(f"/api/people/{canonical_id}/merge/{dup_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["id"] == canonical_id

    # Duplicate should be gone
    r = await client.get(f"/api/people/{dup_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404

    # Reservation should now belong to canonical
    r = await client.get(f"/api/registrations/{res_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["person_id"] == canonical_id


@pytest.mark.anyio
async def test_merge_people_repoints_exhibitor_contact(client):
    """Exhibitor contact_person_id is updated when its person is merged as duplicate."""
    r = await client.post(
        "/api/people",
        json={"name": "Main Person", "email": "main@example.com"},
        headers=ADMIN_HEADERS,
    )
    canonical_id = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={"name": "Old Contact", "email": "old@example.com"},
        headers=ADMIN_HEADERS,
    )
    dup_id = r.json()["id"]

    r = await client.post(
        "/api/exhibitors",
        json={"name": "Wine Co", "type": "producer", "contact_person_id": dup_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    exhibitor_id = r.json()["id"]

    # Merge dup into canonical
    r = await client.post(f"/api/people/{canonical_id}/merge/{dup_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200

    # Exhibitor should now point to canonical
    r = await client.get("/api/exhibitors", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    exhibitor = next((e for e in r.json() if e["id"] == exhibitor_id), None)
    assert exhibitor is not None
    assert exhibitor["contact_person_id"] == canonical_id


@pytest.mark.anyio
async def test_merge_people_identity_conflict(client):
    """409 is raised when both persons have conflicting unique identity fields."""
    r = await client.post(
        "/api/people",
        json={
            "name": "Person A",
            "email": "a@example.com",
            "national_register_number": "12345",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    id_a = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={
            "name": "Person B",
            "email": "b@example.com",
            "national_register_number": "99999",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    id_b = r.json()["id"]

    r = await client.post(f"/api/people/{id_a}/merge/{id_b}", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert "national register number" in r.json()["detail"]


@pytest.mark.anyio
async def test_merge_people_fills_blank_fields(client):
    """Blank string fields on canonical are filled from duplicate."""
    r = await client.post(
        "/api/people",
        json={"name": "Canon", "email": "canon2@example.com", "phone": ""},
        headers=ADMIN_HEADERS,
    )
    canonical_id = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={"name": "Dup", "email": "dup2@example.com", "phone": "+32470111222"},
        headers=ADMIN_HEADERS,
    )
    dup_id = r.json()["id"]

    r = await client.post(f"/api/people/{canonical_id}/merge/{dup_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    # Phone from duplicate should be adopted on canonical
    assert r.json()["phone"] == "+32470111222"


# ---------------------------------------------------------------------------
# Members (admin)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_members_require_auth(client):
    r = await client.get("/api/members")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_members_crud(client):
    payload = {
        "name": "Lieve Janssens",
        "email": "lieve@example.com",
        "phone": "+32475555111",
        "address": "Spuiplein 1, Bredene",
        "roles": ["festival-visitor"],
        "club_name": "Champagne Lovers",
        "notes": "Prefers capsule exchange events.",
        "active": True,
    }

    r = await client.post("/api/members", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    person = r.json()
    assert "member" in person["roles"]

    person_id = person["id"]

    r = await client.get("/api/members", params={"q": "spui"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.put(
        f"/api/members/{person_id}",
        json={"roles": ["treasurer"], "active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert "member" in r.json()["roles"]
    assert r.json()["active"] is False

    r = await client.get("/api/members", params={"active": "false"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.delete(f"/api/members/{person_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204


@pytest.mark.anyio
async def test_members_support_limit_and_page(client):
    created_ids: set[str] = set()
    for i, name in enumerate(("Member Alpha", "Member Bravo", "Member Charlie")):
        r = await client.post(
            "/api/members",
            json={"name": name, "email": f"member{i}@example.com"},
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 201
        created_ids.add(r.json()["id"])

    first_page = await client.get("/api/members", params={"limit": 2, "page": 1}, headers=ADMIN_HEADERS)
    assert first_page.status_code == 200
    first_page_results = first_page.json()
    assert len(first_page_results) == 2

    second_page = await client.get("/api/members", params={"limit": 2, "page": 2}, headers=ADMIN_HEADERS)
    assert second_page.status_code == 200
    second_page_results = second_page.json()
    assert len(second_page_results) >= 1

    first_page_ids = {row["id"] for row in first_page_results}
    second_page_ids = {row["id"] for row in second_page_results}
    assert first_page_ids.isdisjoint(second_page_ids)

    # Ordering must be consistent with the unpaginated endpoint
    all_response = await client.get("/api/members", headers=ADMIN_HEADERS)
    assert all_response.status_code == 200
    all_results = [r for r in all_response.json() if r["id"] in created_ids]
    assert all_results[:2] == first_page_results
    assert all_results[2:3] == second_page_results
