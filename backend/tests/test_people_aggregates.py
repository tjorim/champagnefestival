"""Full-set aggregates and exports for paged people lists (#1177)."""

import csv
import io

import pytest

from app.models import Person
from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_counts_and_exact_email_lookup(client, db_session):
    db_session.add_all(
        [
            Person(id="a", name="Alpha", email="Same@x.io", roles=["member", "volunteer"], notes="needle"),
            Person(id="b", name="Beta", email="same@x.io", roles=["MEMBER", "member"], active=False, notes="needle"),
            Person(id="c", name="Gamma", email="other@x.io", roles=[], notes="unrelated"),
        ]
    )
    await db_session.commit()
    response = await client.get("/api/people/counts", params={"q": "needle"}, headers=ADMIN_HEADERS)
    assert response.json() == {"total": 2, "active": 1, "inactive": 1, "by_role": {"member": 2, "volunteer": 1}}
    response = await client.get(
        "/api/people/counts", params={"q": "needle", "role": "member", "active": False}, headers=ADMIN_HEADERS
    )
    assert response.json() == {"total": 1, "active": 0, "inactive": 1, "by_role": {"member": 1}}
    response = await client.get(
        "/api/people/by-email", params={"email": "SAME@x.io", "limit": 1}, headers=ADMIN_HEADERS
    )
    assert response.json()["total"] == 2
    assert len(response.json()["items"]) == 1
    response = await client.get(
        "/api/people/by-email", params={"email": "same@x.io", "exclude_person_id": "a"}, headers=ADMIN_HEADERS
    )
    assert [p["id"] for p in response.json()["items"]] == ["b"]
    response = await client.get("/api/people/by-email", params={"email": "sam@x.io"}, headers=ADMIN_HEADERS)
    assert response.json()["total"] == 0


@pytest.mark.anyio
async def test_people_export_full_filtered_set_across_batches(client, db_session, monkeypatch):
    from app.services import people_exports

    monkeypatch.setattr(people_exports, "EXPORT_BATCH_SIZE", 2)
    db_session.add_all([Person(id=str(i), name="=1+1", roles=["member"], active=i != 4) for i in range(5)])
    await db_session.commit()
    response = await client.get(
        "/api/people/export",
        params={"role": "member", "active": True, "limit": 1, "page": 9, "sort": "name"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    rows = list(csv.reader(io.StringIO(response.text)))
    assert [r[0] for r in rows[1:]] == ["0", "1", "2", "3"]
    assert all(r[1] == "'=1+1" and r[-1] == "0" for r in rows[1:])


@pytest.mark.anyio
@pytest.mark.parametrize(
    "path", ["/api/people/counts", "/api/people/by-email?email=x@y.io", "/api/people/export", "/api/volunteers/export"]
)
async def test_aggregate_endpoints_require_auth(unauth_client, path):
    assert (await unauth_client.get(path)).status_code == 401


@pytest.mark.anyio
@pytest.mark.parametrize(
    "path", ["/api/people/counts", "/api/people/by-email?email=x@y.io", "/api/people/export", "/api/volunteers/export"]
)
async def test_aggregate_endpoints_require_admin(volunteer_client, path):
    assert (await volunteer_client.get(path)).status_code == 403


@pytest.mark.anyio
@pytest.mark.parametrize("direction", ["asc", "desc"])
async def test_registration_counts_sort_full_set_with_ties(client, db_session, direction):
    from app.models import Registration
    from tests.helpers import _create_event

    event = await _create_event(client)
    db_session.add_all([Person(id=str(i), name="Person", roles=[]) for i in range(5)])
    await db_session.flush()
    db_session.add_all(
        [
            Registration(
                id=f"r{i}-{j}",
                person_id=str(i),
                event_id=event["id"],
                check_in_token=f"token-{i}-{j}",
                guest_count=1,
                status="cancelled" if j == 0 else "confirmed",
            )
            for i in range(5)
            for j in range(i // 2)
        ]
    )
    await db_session.commit()
    actual = []
    for page in range(1, 6):
        response = await client.get(
            "/api/people",
            params={"sort": "registration_count", "sort_dir": direction, "limit": 1, "page": page},
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 200, response.text
        actual.extend((p["registration_count"], p["id"]) for p in response.json()["items"])
    assert actual == sorted([(i // 2, str(i)) for i in range(5)], reverse=direction == "desc")


@pytest.mark.anyio
async def test_volunteer_export_filters_across_batches(client, db_session, monkeypatch):
    from app.services import people_exports

    monkeypatch.setattr(people_exports, "EXPORT_BATCH_SIZE", 1)
    db_session.add_all(
        [
            Person(id="v1", name="Match One", roles=["volunteer"], active=True),
            Person(id="v2", name="Match Two", roles=["volunteer"], active=False),
            Person(id="v3", name="Other", roles=["volunteer"], active=True),
            Person(id="m", name="Match Member", roles=["member"], active=True),
        ]
    )
    await db_session.commit()
    for params, expected in [
        ({"q": "Match", "include_inactive": True}, {"Match One", "Match Two"}),
        ({"q": "Match", "active": False}, {"Match Two"}),
        ({"q": "Match", "active": True, "include_inactive": True}, {"Match One"}),
    ]:
        response = await client.get(
            "/api/volunteers/export", params={**params, "limit": 1, "page": 5}, headers=ADMIN_HEADERS
        )
        assert response.status_code == 200
        assert {r[0] for r in list(csv.reader(io.StringIO(response.text)))[1:]} == expected
