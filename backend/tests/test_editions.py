"""Tests for the editions API (public active endpoint and admin edition management)."""

from __future__ import annotations

import pytest

from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD, _create_event, _post_registration


@pytest.mark.anyio
async def test_active_edition_not_found(client):
    r = await client.get("/api/editions/active")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_active_edition_returns_404_when_only_past_editions_exist(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-past-only",
            "year": 2020,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_response = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-past-only",
            "title": "Past Event",
            "description": "",
            "date": "2020-03-20",
            "start_time": "18:00",
            "end_time": "22:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert event_response.status_code == 201

    response = await client.get("/api/editions/active")

    assert response.status_code == 404
    assert response.json()["detail"] == "No active or upcoming editions found."


@pytest.mark.anyio
async def test_active_edition_returns_embedded_venue_and_exhibitors(client):
    # Create venue
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]

    # Create a producer and a sponsor
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bollinger", "type": "producer"},
        headers=ADMIN_HEADERS,
    )
    producer_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Acme", "type": "sponsor"},
        headers=ADMIN_HEADERS,
    )
    sponsor_id = r.json()["id"]

    # Create active edition
    r = await client.post(
        "/api/editions",
        json={
            "id": "2026",
            "year": 2026,
            "month": "march",
            "venue_id": venue_id,
            "exhibitors": [producer_id, sponsor_id],
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    # Add a far-future event so the edition is considered "upcoming" by the active endpoint
    r = await client.post(
        "/api/events",
        json={
            "edition_id": "2026",
            "title": "Sunday",
            "description": "",
            "date": "2099-03-22",
            "start_time": "14:00",
            "end_time": "18:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    # Public endpoint — no auth required
    r = await client.get("/api/editions/active")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "2026"
    assert data["dates"] == ["2099-03-22"]
    assert data["venue"]["name"] == "Test Venue"
    assert len(data["producers"]) == 1
    assert data["producers"][0]["name"] == "Bollinger"
    assert len(data["sponsors"]) == 1
    assert data["sponsors"][0]["name"] == "Acme"


@pytest.mark.anyio
async def test_active_edition_includes_dates_derived_from_events(client):
    event = await _create_event(client, edition_id="edition-with-dates")

    r = await client.get("/api/editions/active")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "edition-with-dates"
    assert data["dates"] == [event["date"]]


@pytest.mark.anyio
async def test_active_edition_dates_are_unique_when_multiple_events_share_a_day(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-multi-day",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    for payload in [
        {
            "edition_id": "edition-multi-day",
            "title": "Friday Tasting",
            "description": "",
            "date": "2099-03-21",
            "start_time": "17:00",
            "end_time": "18:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
        {
            "edition_id": "edition-multi-day",
            "title": "Friday VIP",
            "description": "",
            "date": "2099-03-21",
            "start_time": "19:00",
            "end_time": "20:00",
            "category": "festival",
            "registration_required": True,
            "active": True,
        },
        {
            "edition_id": "edition-multi-day",
            "title": "Saturday Party",
            "description": "",
            "date": "2099-03-22",
            "start_time": "20:00",
            "end_time": "22:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
    ]:
        event_response = await client.post("/api/events", json=payload, headers=ADMIN_HEADERS)
        assert event_response.status_code == 201

    r = await client.get("/api/editions/active")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "edition-multi-day"
    assert data["dates"] == ["2099-03-21", "2099-03-22"]
    assert [event["title"] for event in data["events"]] == [
        "Friday Tasting",
        "Friday VIP",
        "Saturday Party",
    ]


@pytest.mark.anyio
async def test_active_edition_type_filter_excludes_nearer_community_editions(client):
    """A nearer-ending Bourse or capsule-exchange edition must never stand in for the
    active festival when a festival-specific caller filters by `edition_type=festival`.
    """
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    editions = [
        ("edition-bourse-nearest", "bourse", "2099-01-10"),
        ("edition-capsule-exchange-mid", "capsule_exchange", "2099-02-15"),
        ("edition-festival-farthest", "festival", "2099-03-21"),
    ]
    for edition_id, edition_type, event_date in editions:
        edition_response = await client.post(
            "/api/editions",
            json={
                "id": edition_id,
                "year": 2099,
                "month": "march",
                "venue_id": venue_id,
                "edition_type": edition_type,
                "active": True,
            },
            headers=ADMIN_HEADERS,
        )
        assert edition_response.status_code == 201

        event_response = await client.post(
            "/api/events",
            json={
                "edition_id": edition_id,
                "title": f"{edition_type} event",
                "description": "",
                "date": event_date,
                "start_time": "18:00",
                "end_time": "22:00",
                "category": edition_type,
                "registration_required": False,
                "active": True,
            },
            headers=ADMIN_HEADERS,
        )
        assert event_response.status_code == 201

    # Filtered: the festival edition wins even though it ends latest.
    festival_response = await client.get("/api/editions/active", params={"edition_type": "festival"})
    assert festival_response.status_code == 200
    assert festival_response.json()["id"] == "edition-festival-farthest"

    # Unfiltered: the nearest-ending edition (regardless of type) wins — this is the
    # ambiguous default that festival-specific callers must avoid by filtering explicitly.
    unfiltered_response = await client.get("/api/editions/active")
    assert unfiltered_response.status_code == 200
    assert unfiltered_response.json()["id"] == "edition-bourse-nearest"

    # Other types remain independently selectable.
    bourse_response = await client.get("/api/editions/active", params={"edition_type": "bourse"})
    assert bourse_response.status_code == 200
    assert bourse_response.json()["id"] == "edition-bourse-nearest"

    capsule_response = await client.get("/api/editions/active", params={"edition_type": "capsule_exchange"})
    assert capsule_response.status_code == 200
    assert capsule_response.json()["id"] == "edition-capsule-exchange-mid"


@pytest.mark.anyio
async def test_standalone_event_can_move_within_same_single_day(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-bourse-single-day",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_response = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-bourse-single-day",
            "title": "Bourse Opening",
            "description": "",
            "date": "2099-03-21",
            "start_time": "10:00",
            "end_time": "11:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert event_response.status_code == 201
    event_id = event_response.json()["id"]

    update_response = await client.put(
        f"/api/events/{event_id}",
        json={"date": "2099-03-21", "title": "Bourse Opening Updated"},
        headers=ADMIN_HEADERS,
    )

    assert update_response.status_code == 200
    assert update_response.json()["date"] == "2099-03-21"


@pytest.mark.anyio
async def test_community_edition_upcoming_lists_every_active_event_in_time_order(client):
    """Community editions may hold multiple same-day events; the public payload lists every

    active one in date/time order, and excludes inactive (draft/cancelled) events entirely.
    """
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-bourse-multi-event",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    # Created out of chronological order to prove ordering is by time, not insertion order.
    for payload in [
        {
            "edition_id": "edition-bourse-multi-event",
            "title": "Bourse Auction",
            "description": "",
            "date": "2099-03-21",
            "start_time": "15:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        {
            "edition_id": "edition-bourse-multi-event",
            "title": "Bourse Opening",
            "description": "",
            "date": "2099-03-21",
            "start_time": "10:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        {
            "edition_id": "edition-bourse-multi-event",
            "title": "Draft Tasting",
            "description": "",
            "date": "2099-03-21",
            "start_time": "12:00",
            "category": "exchange",
            "registration_required": False,
            "active": False,
        },
    ]:
        event_response = await client.post("/api/events", json=payload, headers=ADMIN_HEADERS)
        assert event_response.status_code == 201

    r = await client.get("/api/editions/upcoming", params={"edition_type": "bourse"})
    assert r.status_code == 200
    edition = next(e for e in r.json() if e["id"] == "edition-bourse-multi-event")
    assert [event["title"] for event in edition["events"]] == [
        "Bourse Opening",
        "Bourse Auction",
    ]


@pytest.mark.anyio
async def test_inactive_event_does_not_keep_finished_edition_upcoming(client):
    """An edition whose only future event is inactive must not be reported as active/upcoming."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-only-inactive-future",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_response = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-only-inactive-future",
            "title": "Draft Sunday",
            "description": "",
            "date": "2099-03-22",
            "start_time": "14:00",
            "category": "festival",
            "registration_required": False,
            "active": False,
        },
        headers=ADMIN_HEADERS,
    )
    assert event_response.status_code == 201

    active_response = await client.get("/api/editions/active")
    assert active_response.status_code == 404

    upcoming_response = await client.get("/api/editions/upcoming")
    assert upcoming_response.status_code == 200
    assert all(edition["id"] != "edition-only-inactive-future" for edition in upcoming_response.json())


@pytest.mark.anyio
async def test_inactive_events_excluded_from_active_edition_response(client):
    """A mix of active and inactive events on the same edition: only the active one is returned."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-mixed-active",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    for payload in [
        {
            "edition_id": "edition-mixed-active",
            "title": "Draft Preview",
            "description": "",
            "date": "2099-03-20",
            "start_time": "10:00",
            "category": "festival",
            "registration_required": False,
            "active": False,
        },
        {
            "edition_id": "edition-mixed-active",
            "title": "Published Gala",
            "description": "",
            "date": "2099-03-21",
            "start_time": "18:00",
            "category": "festival",
            "registration_required": False,
            "active": True,
        },
    ]:
        event_response = await client.post("/api/events", json=payload, headers=ADMIN_HEADERS)
        assert event_response.status_code == 201

    active_response = await client.get("/api/editions/active")
    assert active_response.status_code == 200
    data = active_response.json()
    assert data["id"] == "edition-mixed-active"
    assert [event["title"] for event in data["events"]] == ["Published Gala"]
    assert data["dates"] == ["2099-03-21"]

    admin_response = await client.get(f"/api/editions/{data['id']}", headers=ADMIN_HEADERS)
    assert admin_response.status_code == 200
    admin_data = admin_response.json()
    assert [event["title"] for event in admin_data["events"]] == ["Draft Preview", "Published Gala"]
    assert admin_data["dates"] == ["2099-03-20", "2099-03-21"]


# ---------------------------------------------------------------------------
# GET /api/editions/upcoming — public contract
# ---------------------------------------------------------------------------


async def _create_upcoming_edition(
    client,
    *,
    edition_id: str,
    venue_id: str,
    edition_type: str = "bourse",
    active: bool = True,
    external_partner: str | None = None,
    external_contact_name: str | None = None,
    external_contact_email: str | None = None,
    year: int = 2099,
):
    payload: dict[str, object] = {
        "id": edition_id,
        "year": year,
        "month": "march",
        "venue_id": venue_id,
        "edition_type": edition_type,
        "active": active,
    }
    if external_partner is not None:
        payload["external_partner"] = external_partner
    if external_contact_name is not None:
        payload["external_contact_name"] = external_contact_name
    if external_contact_email is not None:
        payload["external_contact_email"] = external_contact_email
    r = await client.post("/api/editions", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    return r.json()


async def _create_upcoming_event(
    client,
    *,
    edition_id: str,
    date: str,
    title: str = "Event",
    start_time: str = "10:00",
    active: bool = True,
):
    r = await client.post(
        "/api/events",
        json={
            "edition_id": edition_id,
            "title": title,
            "description": "",
            "date": date,
            "start_time": start_time,
            "category": "exchange",
            "registration_required": False,
            "active": active,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.anyio
async def test_upcoming_filters_by_exact_single_edition_type(client):
    """`edition_type` must be an exact match: a bourse/festival edition must never
    leak into a `capsule_exchange`-filtered response, even though all three exist.
    """
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    for edition_id, edition_type in [
        ("edition-upcoming-festival", "festival"),
        ("edition-upcoming-bourse", "bourse"),
        ("edition-upcoming-capsule", "capsule_exchange"),
    ]:
        await _create_upcoming_edition(client, edition_id=edition_id, venue_id=venue_id, edition_type=edition_type)
        await _create_upcoming_event(client, edition_id=edition_id, date="2099-05-01")

    r = await client.get("/api/editions/upcoming", params={"edition_type": "capsule_exchange"})
    assert r.status_code == 200
    ids = {edition["id"] for edition in r.json()}
    assert ids == {"edition-upcoming-capsule"}


@pytest.mark.anyio
async def test_upcoming_returns_mixed_community_edition_types_when_unfiltered(client):
    """Without a filter, editions of multiple types are returned together."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    await _create_upcoming_edition(client, edition_id="edition-mixed-bourse", venue_id=venue_id, edition_type="bourse")
    await _create_upcoming_event(client, edition_id="edition-mixed-bourse", date="2099-05-01")
    await _create_upcoming_edition(
        client, edition_id="edition-mixed-capsule", venue_id=venue_id, edition_type="capsule_exchange"
    )
    await _create_upcoming_event(client, edition_id="edition-mixed-capsule", date="2099-06-01")

    r = await client.get("/api/editions/upcoming")
    assert r.status_code == 200
    ids = {edition["id"] for edition in r.json()}
    assert {"edition-mixed-bourse", "edition-mixed-capsule"}.issubset(ids)


@pytest.mark.anyio
async def test_upcoming_excludes_inactive_editions(client):
    """An inactive edition must not appear even with a future event."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    await _create_upcoming_edition(client, edition_id="edition-upcoming-active", venue_id=venue_id, active=True)
    await _create_upcoming_event(client, edition_id="edition-upcoming-active", date="2099-05-01")
    await _create_upcoming_edition(client, edition_id="edition-upcoming-inactive", venue_id=venue_id, active=False)
    await _create_upcoming_event(client, edition_id="edition-upcoming-inactive", date="2099-05-01")

    r = await client.get("/api/editions/upcoming", params={"edition_type": "bourse"})
    assert r.status_code == 200
    ids = {edition["id"] for edition in r.json()}
    assert "edition-upcoming-active" in ids
    assert "edition-upcoming-inactive" not in ids


@pytest.mark.anyio
async def test_upcoming_excludes_editions_whose_latest_event_is_in_the_past(client):
    """An edition whose only (active) event already happened must not be reported upcoming."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    await _create_upcoming_edition(client, edition_id="edition-upcoming-past", venue_id=venue_id, year=2020)
    await _create_upcoming_event(client, edition_id="edition-upcoming-past", date="2020-01-10")

    r = await client.get("/api/editions/upcoming", params={"edition_type": "bourse"})
    assert r.status_code == 200
    ids = {edition["id"] for edition in r.json()}
    assert "edition-upcoming-past" not in ids


@pytest.mark.anyio
async def test_upcoming_excludes_editions_without_events(client):
    """An edition with no events at all has no upcoming date and must be excluded."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    await _create_upcoming_edition(client, edition_id="edition-upcoming-no-events", venue_id=venue_id)

    r = await client.get("/api/editions/upcoming", params={"edition_type": "bourse"})
    assert r.status_code == 200
    ids = {edition["id"] for edition in r.json()}
    assert "edition-upcoming-no-events" not in ids


@pytest.mark.anyio
async def test_upcoming_includes_embedded_venue_and_external_contact_fields(client):
    """The public payload embeds the full venue and the community-edition contact fields
    the frontend's `CommunityEvents` relies on.
    """
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    await _create_upcoming_edition(
        client,
        edition_id="edition-upcoming-contact",
        venue_id=venue_id,
        external_partner="Local Wine Club",
        external_contact_name="Jean Dupont",
        external_contact_email="jean@example.com",
    )
    await _create_upcoming_event(client, edition_id="edition-upcoming-contact", date="2099-05-01")

    r = await client.get("/api/editions/upcoming", params={"edition_type": "bourse"})
    assert r.status_code == 200
    edition = next(e for e in r.json() if e["id"] == "edition-upcoming-contact")
    assert edition["venue"]["name"] == "Test Venue"
    assert edition["external_partner"] == "Local Wine Club"
    assert edition["external_contact_name"] == "Jean Dupont"
    assert edition["external_contact_email"] == "jean@example.com"


@pytest.mark.anyio
async def test_upcoming_editions_are_ordered_by_start_date(client):
    """Editions in the response must be ordered chronologically by their earliest
    active event, regardless of creation order.
    """
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    # Created out of chronological order to prove ordering isn't insertion order.
    await _create_upcoming_edition(client, edition_id="edition-order-latest", venue_id=venue_id)
    await _create_upcoming_event(client, edition_id="edition-order-latest", date="2099-07-01")
    await _create_upcoming_edition(client, edition_id="edition-order-earliest", venue_id=venue_id)
    await _create_upcoming_event(client, edition_id="edition-order-earliest", date="2099-05-01")

    r = await client.get("/api/editions/upcoming", params={"edition_type": "bourse"})
    assert r.status_code == 200
    ordered_ids = [edition["id"] for edition in r.json() if edition["id"].startswith("edition-order-")]
    assert ordered_ids == ["edition-order-earliest", "edition-order-latest"]


@pytest.mark.anyio
async def test_upcoming_rejects_unsupported_edition_type(client):
    """A malformed/unsupported `edition_type` query parameter is rejected outright,
    rather than silently ignored or matching every edition.
    """
    r = await client.get("/api/editions/upcoming", params={"edition_type": "not-a-real-type"})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_standalone_event_rejects_a_second_date(client):
    """Community editions may only span a single calendar date."""
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-bourse-two-dates",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    first_event = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-bourse-two-dates",
            "title": "Bourse Opening",
            "description": "",
            "date": "2099-03-21",
            "start_time": "10:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert first_event.status_code == 201

    second_event = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-bourse-two-dates",
            "title": "Bourse Auction",
            "description": "",
            "date": "2099-03-22",
            "start_time": "10:00",
            "category": "exchange",
            "registration_required": False,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert second_event.status_code == 400
    assert "single date" in second_event.json()["detail"].lower()


@pytest.mark.anyio
async def test_edition_rejects_vendor_exhibitors(client):
    """Vendor-type exhibitors must not be linked to editions."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Food Vendor", "type": "vendor"},
        headers=ADMIN_HEADERS,
    )
    vendor_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "2026v",
            "year": 2026,
            "month": "march",
            "venue_id": venue_id,
            "exhibitors": [vendor_id],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400
    assert "vendor" in r.json()["detail"].lower()


@pytest.mark.anyio
@pytest.mark.parametrize("target_type", ["bourse", "capsule_exchange"])
async def test_converting_festival_to_community_edition_clears_exhibitors(client, target_type):
    """Converting a festival with producers/sponsors to a community type must succeed
    and atomically drop the now-invalid exhibitor associations, even if the caller
    doesn't send an explicit `exhibitors` field alongside the type change.
    """
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bollinger", "type": "producer"},
        headers=ADMIN_HEADERS,
    )
    producer_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Acme", "type": "sponsor"},
        headers=ADMIN_HEADERS,
    )
    sponsor_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "edition-convert-to-community",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "festival",
            "exhibitors": [producer_id, sponsor_id],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert len(r.json()["producers"]) == 1
    assert len(r.json()["sponsors"]) == 1

    r = await client.put(
        "/api/editions/edition-convert-to-community",
        json={"edition_type": target_type},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["edition_type"] == target_type
    assert data["producers"] == []
    assert data["sponsors"] == []

    r = await client.get("/api/editions/edition-convert-to-community", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["producers"] == []
    assert r.json()["sponsors"] == []


@pytest.mark.anyio
async def test_converting_festival_to_community_edition_with_explicit_empty_exhibitors(client):
    """The frontend contract sends an explicit `exhibitors: []` alongside the type
    change; this must also succeed and clear associations (not just the implicit path).
    """
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bollinger", "type": "producer"},
        headers=ADMIN_HEADERS,
    )
    producer_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "edition-convert-explicit-empty",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "festival",
            "exhibitors": [producer_id],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.put(
        "/api/editions/edition-convert-explicit-empty",
        json={"edition_type": "bourse", "exhibitors": []},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["producers"] == []


@pytest.mark.anyio
async def test_festival_to_festival_edit_preserves_exhibitors(client):
    """Editing a festival edition without touching its type must not disturb exhibitors."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bollinger", "type": "producer"},
        headers=ADMIN_HEADERS,
    )
    producer_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "edition-festival-preserve",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "festival",
            "exhibitors": [producer_id],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.put(
        "/api/editions/edition-festival-preserve",
        json={"month": "april"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["month"] == "april"
    assert len(r.json()["producers"]) == 1
    assert r.json()["producers"][0]["id"] == producer_id


@pytest.mark.anyio
async def test_community_edition_update_still_rejects_explicit_exhibitors(client):
    """Backend validation must still reject an explicit attempt to assign exhibitors
    to a community edition, whether or not the type is changing in the same request.
    """
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bollinger", "type": "producer"},
        headers=ADMIN_HEADERS,
    )
    producer_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "edition-community-reject",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.put(
        "/api/editions/edition-community-reject",
        json={"exhibitors": [producer_id]},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400
    assert "festival" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Edition attendance stats
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_edition_stats_requires_admin(unauth_client):
    r = await unauth_client.get("/api/editions/stats")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_edition_stats_aggregates_registrations(client):
    event = await _create_event(client, edition_id="edition-stats", title="Stats Night", date="2099-04-10")

    r1 = await _post_registration(client, event=event, name="Guest One", email="one@example.com", guest_count=2)
    assert r1.status_code == 201
    r2 = await _post_registration(client, event=event, name="Guest Two", email="two@example.com", guest_count=3)
    assert r2.status_code == 201

    # Check one of them in.
    reg_id = r1.json()["id"]
    r = await client.get(f"/api/registrations/{reg_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    token = r.json()["check_in_token"]
    r = await client.post(f"/api/check-in/{reg_id}/lookup", json={"token": token})
    assert r.status_code == 200
    r = await client.post(f"/api/check-in/{reg_id}", json={"token": token})
    assert r.status_code == 200

    # A cancelled registration must not count.
    r3 = await _post_registration(client, event=event, name="Guest Three", email="three@example.com", guest_count=1)
    cancelled_id = r3.json()["id"]
    r = await client.put(
        f"/api/registrations/{cancelled_id}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/editions/stats", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    entry = next(e for e in r.json() if e["edition_id"] == "edition-stats")
    assert entry["events_count"] == 1
    assert entry["total_registrations"] == 2
    assert entry["total_guests"] == 5
    assert entry["total_checked_in"] == 2
    assert entry["start_date"] == "2099-04-10"


@pytest.mark.anyio
async def test_edition_stats_includes_editions_with_no_registrations(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]
    r = await client.post(
        "/api/editions",
        json={"id": "edition-stats-empty", "year": 2100, "month": "march", "venue_id": venue_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.get("/api/editions/stats", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    entry = next(e for e in r.json() if e["edition_id"] == "edition-stats-empty")
    assert entry["total_registrations"] == 0
    assert entry["total_guests"] == 0
    assert entry["total_checked_in"] == 0
    assert entry["events_count"] == 0


@pytest.mark.anyio
@pytest.mark.parametrize(
    "email",
    [
        "organizer@example.com",
        "first.last@example.co.uk",
        "bourse+events@example.com",
        # RFC 5321 atext characters beyond the common "safe" subset.
        "bourse!#$%&'*=?^_`{|}~-tag@example.com",
    ],
)
async def test_edition_accepts_legitimate_contact_emails(client, email):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "edition-contact-valid",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "external_contact_email": email,
        },
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 201, r.text
    assert r.json()["external_contact_email"] == email


@pytest.mark.anyio
@pytest.mark.parametrize(
    "email",
    [
        "organizer@example.com?bcc=other@example.com",
        "organizer@example.com\r\nBcc:other@example.com",
        "not-an-email",
        '"quoted local part"@example.com',
        # Unicode local part — SMTPUTF8 addresses are intentionally unsupported.
        "örganizer@example.com",
        # Unicode domain that has not been IDNA/punycode-encoded.
        "organizer@münchen.example",
        # Pydantic's EmailStr normalizes IDNA/punycode domains back to Unicode,
        # so even an ASCII-on-the-wire internationalized domain is rejected.
        "organizer@xn--nxasmq6b.example",
    ],
)
async def test_edition_rejects_unsafe_or_unsupported_contact_emails(client, email):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "edition-contact-invalid",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
            "external_contact_email": email,
        },
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 422


@pytest.mark.anyio
async def test_edition_update_rejects_unsafe_contact_email(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "edition-contact-update",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "edition_type": "bourse",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.put(
        "/api/editions/edition-contact-update",
        json={"external_contact_email": "organizer@example.com?bcc=other@example.com"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422
