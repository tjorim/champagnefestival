"""Member indicators and the current-member email invariant (#1403)."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.mcp.admin import members as mcp_members
from app.models import Edition, Event, Person, Registration, Venue
from app.services.people_listing import inactivity_cutoff
from tests.helpers import ADMIN_HEADERS, mcp_session_factory, requires_postgres


async def member(client, email=None, **fields):
    response = await client.post(
        "/api/members", headers=ADMIN_HEADERS, json={"name": "Member", "email": email, **fields}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_email_uniqueness_all_transitions(client):
    first = await member(client, "Alice@example.com")
    clash = await client.post(
        "/api/members", headers=ADMIN_HEADERS, json={"name": "Other", "email": "ALICE@example.com"}
    )
    assert clash.status_code == 409
    assert clash.json()["code"] == "member_email_in_use"
    # Non-members may share the email, but cannot be granted membership while it is in use.
    guest = (
        await client.post("/api/people", headers=ADMIN_HEADERS, json={"name": "Guest", "email": "alice@example.com"})
    ).json()
    response = await client.put(f"/api/people/{guest['id']}", headers=ADMIN_HEADERS, json={"roles": ["member"]})
    assert response.status_code == 409
    assert response.json()["code"] == "member_email_in_use"
    await client.post(f"/api/members/{first['id']}/deactivate", headers=ADMIN_HEADERS)
    second = await member(client, "alice@example.com")
    response = await client.post(f"/api/members/{first['id']}/reactivate", headers=ADMIN_HEADERS)
    assert response.status_code == 409
    assert response.json()["code"] == "member_email_in_use"
    third = await member(client, "third@example.com")
    for endpoint in ("members", "people"):
        response = await client.put(
            f"/api/{endpoint}/{third['id']}", headers=ADMIN_HEADERS, json={"email": second["email"]}
        )
        assert response.status_code == 409
        assert response.json()["code"] == "member_email_in_use"
    await member(client)
    await member(client)


async def test_merge_checks_result_and_releases_duplicate(client):
    current = await member(client, "used@example.com")
    retired = await member(client, "retired@example.com")
    await client.post(f"/api/members/{retired['id']}/deactivate", headers=ADMIN_HEADERS)
    guest = (
        await client.post("/api/people", headers=ADMIN_HEADERS, json={"name": "Guest", "email": current["email"]})
    ).json()
    # Adopting a role cannot turn the canonical guest into a conflicting current member.
    response = await client.post(f"/api/people/{guest['id']}/merge/{retired['id']}", headers=ADMIN_HEADERS)
    assert response.status_code == 200  # retired role remains retired
    blank = (await client.post("/api/people", headers=ADMIN_HEADERS, json={"name": "Blank"})).json()
    response = await client.post(f"/api/people/{blank['id']}/merge/{current['id']}", headers=ADMIN_HEADERS)
    assert response.status_code == 200, response.text
    assert response.json()["email"] == current["email"]


async def test_merge_rejects_third_party_email_conflict(client):
    current = await member(client, "used@example.com")
    guest = (
        await client.post("/api/people", headers=ADMIN_HEADERS, json={"name": "Guest", "email": current["email"]})
    ).json()
    active = await member(client)
    response = await client.post(f"/api/people/{guest['id']}/merge/{active['id']}", headers=ADMIN_HEADERS)
    assert response.status_code == 409
    assert response.json()["code"] == "member_email_in_use"
    assert (await client.get(f"/api/members/{active['id']}", headers=ADMIN_HEADERS)).status_code == 200


async def test_database_enforces_email_invariant(db_session):
    db_session.add_all(
        [
            Person(id="a", name="A", email="A@example.com", roles=["member"]),
            Person(id="b", name="B", email="a@example.com", roles=["member"]),
        ]
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


async def test_settings_nullable_indicators_and_mcp_exemption(client, db_session):
    response = await client.put(
        "/api/settings", headers=ADMIN_HEADERS, json={"member_limit": 1, "member_inactivity_months": 6}
    )
    assert response.status_code == 200
    await member(client, "one@example.com")
    await member(client, "two@example.com")  # limit never blocks writes
    assert (await client.put("/api/settings", headers=ADMIN_HEADERS, json={"member_limit": 0})).status_code == 422
    response = await client.put("/api/settings", headers=ADMIN_HEADERS, json={"member_limit": None})
    assert response.json()["member_limit"] is None
    assert response.json()["member_inactivity_months"] == 6
    factory = mcp_session_factory(db_session)
    created = await mcp_members.create_member(
        factory, "admin", name="Exempt", inactivity_exempt=True, inactivity_exempt_note="Reason"
    )
    assert created["inactivity_exempt"] is True
    updated = await mcp_members.update_member(
        factory, "admin", created["id"], inactivity_exempt=False, inactivity_exempt_note=""
    )
    assert updated["inactivity_exempt"] is False
    assert updated["inactivity_exempt_note"] == ""


def test_calendar_month_boundary():
    assert inactivity_cutoff(date(2026, 3, 31), 1) == date(2026, 2, 28)
    assert inactivity_cutoff(date(2024, 3, 31), 1) == date(2024, 2, 29)
    assert inactivity_cutoff(date(2026, 1, 10), 13) == date(2024, 12, 10)


async def test_last_attended_sort_filter_highlight(client, db_session):
    today = datetime.now(UTC).date()
    cutoff = inactivity_cutoff(today, 3)
    await client.put("/api/settings", headers=ADMIN_HEADERS, json={"member_inactivity_months": 3})
    db_session.add(Venue(id="v", name="Venue"))
    await db_session.flush()
    db_session.add_all(
        [
            Edition(id="caps", month="October", year=2026, venue_id="v", edition_type="capsule_exchange"),
            Edition(id="fest", month="October", year=2026, venue_id="v"),
        ]
    )
    await db_session.flush()
    dates = [cutoff - timedelta(days=1), cutoff, today]
    for i, day in enumerate(dates):
        db_session.add(
            Event(
                id=f"e{i}",
                edition_id="caps",
                title_nl="Exchange",
                date=day,
                start_time="10:00",
                end_time="12:00",
                category="general",
            )
        )
    db_session.add(
        Event(
            id="festival",
            edition_id="fest",
            title_nl="Festival",
            date=today,
            start_time="10:00",
            end_time="12:00",
            category="general",
        )
    )
    people = [Person(id=f"p{i}", name=f"Person {i}", roles=["member"], inactivity_exempt=i == 3) for i in range(5)]
    db_session.add_all(people)
    await db_session.flush()
    for i, event in enumerate(["e0", "e1", "e2", "e0"]):
        db_session.add(
            Registration(
                id=f"r{i}",
                event_id=event,
                person_id=f"p{i}",
                guest_count=1,
                check_in_token=f"token{i}",
                checked_in=True,
            )
        )
    db_session.add_all(
        [
            Registration(
                id="unchecked", event_id="e2", person_id="p0", guest_count=1, check_in_token="unchecked-token"
            ),
            Registration(
                id="wrong-edition",
                check_in_token="wrong-edition-token",
                event_id="festival",
                person_id="p0",
                guest_count=1,
                checked_in=True,
            ),
        ]
    )
    await db_session.commit()
    response = await client.get("/api/people?role=member&sort=last_attended", headers=ADMIN_HEADERS)
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert [r["id"] for r in rows] == ["p0", "p3", "p1", "p2", "p4"]
    assert [r["inactivity_highlight"] for r in rows] == [True, False, False, False, False]
    response = await client.get(f"/api/people?role=member&last_attended_before={cutoff}", headers=ADMIN_HEADERS)
    assert response.json()["total"] == 2
    response = await client.get(
        "/api/people?role=member&sort=last_attended&sort_dir=desc&limit=2", headers=ADMIN_HEADERS
    )
    assert [r["id"] for r in response.json()["items"]] == ["p2", "p1"]
    listed = await mcp_members.list_members(
        mcp_session_factory(db_session), sort="last_attended", sort_dir="desc", last_attended_before=cutoff
    )
    assert [row["id"] for row in listed["members"]] == ["p3", "p0"]
    await client.put("/api/settings", headers=ADMIN_HEADERS, json={"member_inactivity_months": None})
    response = await client.get("/api/people?role=member", headers=ADMIN_HEADERS)
    assert not any(row["inactivity_highlight"] for row in response.json()["items"])


@requires_postgres("concurrent unique email writes")
async def test_concurrent_member_email_conflict(engine, db_session, monkeypatch):
    import asyncio

    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.schemas import PersonCreate
    from app.services import members_service
    from app.services.errors import ApiHTTPException

    ready = asyncio.Event()
    checked = 0
    original = members_service.ensure_member_email

    async def check_then_wait(db, person):
        nonlocal checked
        await original(db, person)
        checked += 1
        if checked == 2:
            ready.set()
        await asyncio.wait_for(ready.wait(), timeout=10)

    monkeypatch.setattr(members_service, "ensure_member_email", check_then_wait)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def create():
        async with factory() as db:
            return await members_service.create_member(
                db, body=PersonCreate(name="Concurrent", email="race@example.com"), actor="admin"
            )

    results = await asyncio.gather(create(), create(), return_exceptions=True)
    assert sum(isinstance(result, dict) for result in results) == 1
    conflicts = [result for result in results if isinstance(result, ApiHTTPException)]
    assert len(conflicts) == 1
    assert conflicts[0].code == "member_email_in_use"
    assert await db_session.scalar(select(func.count()).select_from(Person)) == 1
