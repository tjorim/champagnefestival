"""The shared paged list contract on ``GET /api/people`` and ``GET /api/volunteers`` (#1176).

Both endpoints take ``q``, ``page``, ``limit``, ``sort`` and ``sort_dir`` and
answer ``{items, total, limit, page}``. The properties that matter to a
server-driven table are checked here against rows seeded with heavy ties on every
sortable column: paging through a sort never skips or repeats a row, ``total``
counts the whole filtered set, and an unknown sort is a 422 rather than a silent
default.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.dependencies import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT
from app.models import Person
from app.services.operational_search import normalize_text
from tests.helpers import ADMIN_HEADERS

# Single-word names and equal-length e-mail local parts keep Python's ordinal
# comparison identical to the database collation, whatever it is.
_NAMES = ["alice", "Bob", "bob", "Carol", "dave", "Dave"]
_EMAILS = ["aaa@x.io", "bbb@x.io", "ccc@x.io"]
_BASE = datetime(2026, 1, 1, tzinfo=UTC)
_STAMPS = [_BASE + timedelta(days=d) for d in range(3)]


async def _seed(db_session, count: int = 24) -> list[Person]:
    """``count`` people with only a handful of distinct names, e-mails and timestamps.

    Every sortable column therefore has many ties, so only the id tiebreak makes
    the order total. Every third person also holds the volunteer role.
    """
    people = [
        Person(
            id=f"per_{i:03d}",
            name=_NAMES[i % len(_NAMES)],
            email=_EMAILS[i % len(_EMAILS)],
            roles=["volunteer"] if i % 3 == 0 else ["member"],
            active=i % 4 != 0,
            created_at=_STAMPS[i % len(_STAMPS)],
            updated_at=_STAMPS[(i * 2) % len(_STAMPS)],
        )
        for i in range(count)
    ]
    db_session.add_all(people)
    await db_session.commit()
    return people


def _sort_key(person: Person, sort: str) -> Any:
    match sort:
        case "name":
            return normalize_text(person.name)
        case "email":
            return person.email.lower()
        case "created":
            return person.created_at
        case "updated":
            return person.updated_at
    raise AssertionError(sort)


async def _read_all_pages(client, path: str, page_size: int, **params: Any) -> tuple[list[str], int]:
    ids: list[str] = []
    page = 1
    while True:
        response = await client.get(path, params={**params, "limit": page_size, "page": page}, headers=ADMIN_HEADERS)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["limit"] == page_size
        assert body["page"] == page
        ids.extend(item["id"] for item in body["items"])
        if len(body["items"]) < page_size:
            return ids, body["total"]
        page += 1


@pytest.mark.anyio
@pytest.mark.parametrize("sort_dir", ["asc", "desc"])
@pytest.mark.parametrize("page_size", [1, 5, 7])
@pytest.mark.parametrize("sort", ["name", "email", "created", "updated"])
async def test_people_paging_through_a_sort_has_no_gaps_or_repeats(client, db_session, sort, page_size, sort_dir):
    people = await _seed(db_session)

    ids, total = await _read_all_pages(client, "/api/people", page_size, sort=sort, sort_dir=sort_dir)

    assert total == len(people)
    assert len(ids) == len(set(ids)) == len(people)
    expected = sorted(
        people,
        key=lambda p: (_sort_key(p, sort), p.id),
        reverse=sort_dir == "desc",
    )
    assert ids == [p.id for p in expected]


@pytest.mark.anyio
@pytest.mark.parametrize("sort_dir", ["asc", "desc"])
@pytest.mark.parametrize("page_size", [1, 4])
@pytest.mark.parametrize("sort", ["name", "created", "updated"])
async def test_volunteers_paging_through_a_sort_has_no_gaps_or_repeats(client, db_session, sort, page_size, sort_dir):
    people = await _seed(db_session)
    volunteers = [p for p in people if "volunteer" in p.roles]

    ids, total = await _read_all_pages(client, "/api/volunteers", page_size, sort=sort, sort_dir=sort_dir)

    assert total == len(volunteers)
    assert len(ids) == len(set(ids)) == len(volunteers)
    expected = sorted(
        volunteers,
        key=lambda p: (_sort_key(p, sort), p.id),
        reverse=sort_dir == "desc",
    )
    assert ids == [p.id for p in expected]


@pytest.mark.anyio
async def test_people_default_order_is_newest_first_with_id_tiebreak(client, db_session):
    people = await _seed(db_session)

    ids, total = await _read_all_pages(client, "/api/people", 5)

    assert total == len(people)
    expected = sorted(people, key=lambda p: (p.created_at, p.id), reverse=True)
    assert ids == [p.id for p in expected]


@pytest.mark.anyio
async def test_people_filters_combine_with_sort_and_total_counts_the_filtered_set(client, db_session):
    people = await _seed(db_session)
    matching = [p for p in people if "member" in p.roles and p.active]

    ids, total = await _read_all_pages(
        client, "/api/people", 3, role="member", active="true", sort="name", sort_dir="desc"
    )

    assert total == len(matching)
    expected = sorted(matching, key=lambda p: (normalize_text(p.name), p.id), reverse=True)
    assert ids == [p.id for p in expected]


@pytest.mark.anyio
async def test_volunteers_filters_combine_with_sort_and_total_counts_the_filtered_set(client, db_session):
    people = await _seed(db_session)
    matching = [p for p in people if "volunteer" in p.roles and not p.active]
    assert matching

    ids, total = await _read_all_pages(client, "/api/volunteers", 2, active="false", sort="updated")

    assert total == len(matching)
    expected = sorted(matching, key=lambda p: (p.updated_at, p.id))
    assert ids == [p.id for p in expected]


@pytest.mark.anyio
async def test_explicit_sort_overrides_search_relevance(client, db_session):
    await _seed(db_session)

    # "bob" matches Bob and bob; both are exact matches, so relevance ties and
    # falls through to name, id. An explicit created sort must replace that.
    by_relevance = await client.get("/api/people", params={"q": "bob", "limit": 100}, headers=ADMIN_HEADERS)
    by_created = await client.get(
        "/api/people", params={"q": "bob", "sort": "created", "sort_dir": "desc", "limit": 100}, headers=ADMIN_HEADERS
    )

    relevance_items = by_relevance.json()["items"]
    created_items = by_created.json()["items"]
    assert {i["id"] for i in relevance_items} == {i["id"] for i in created_items}
    assert [i["created_at"] for i in created_items] == sorted((i["created_at"] for i in created_items), reverse=True)
    assert by_created.json()["total"] == by_relevance.json()["total"]


@pytest.mark.anyio
@pytest.mark.parametrize(("path", "q"), [("/api/people", "dave"), ("/api/volunteers", "carol")])
async def test_search_without_sort_is_paged_deterministically(client, db_session, path, q):
    await _seed(db_session)

    full = await client.get(path, params={"q": q, "limit": MAX_LIST_LIMIT}, headers=ADMIN_HEADERS)
    ids, total = await _read_all_pages(client, path, 2, q=q)

    assert total == full.json()["total"] > 0
    assert ids == [item["id"] for item in full.json()["items"]]
    assert len(ids) == len(set(ids))


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/people", {"sort": "phone"}),
        ("/api/people", {"sort": "id; drop table people"}),
        ("/api/people", {"sort": "name", "sort_dir": "sideways"}),
        ("/api/volunteers", {"sort": "email"}),
        ("/api/volunteers", {"sort": "bogus"}),
        ("/api/volunteers", {"sort": "name", "sort_dir": "up"}),
        ("/api/people", {"limit": 0}),
        ("/api/people", {"limit": MAX_LIST_LIMIT + 1}),
        ("/api/volunteers", {"limit": 0}),
        ("/api/volunteers", {"limit": MAX_LIST_LIMIT + 1}),
        ("/api/people", {"page": 0}),
        ("/api/volunteers", {"page": 0}),
    ],
)
async def test_invalid_list_parameters_are_rejected_with_422(client, path, params):
    response = await client.get(path, params=params, headers=ADMIN_HEADERS)
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.parametrize("path", ["/api/people", "/api/volunteers"])
async def test_omitted_limit_uses_the_one_documented_default_and_is_never_unbounded(client, db_session, path):
    await _seed(db_session, count=DEFAULT_LIST_LIMIT + 11)
    seeded = DEFAULT_LIST_LIMIT + 11
    expected_total = seeded if path == "/api/people" else len(range(0, seeded, 3))

    first = await client.get(path, headers=ADMIN_HEADERS)
    assert first.status_code == 200
    body = first.json()
    assert body["limit"] == DEFAULT_LIST_LIMIT
    assert body["page"] == 1
    assert body["total"] == expected_total
    assert len(body["items"]) == min(DEFAULT_LIST_LIMIT, expected_total)

    # `page` without `limit` pages through the default size instead of 422.
    second = await client.get(path, params={"page": 2}, headers=ADMIN_HEADERS)
    assert second.status_code == 200
    assert second.json()["limit"] == DEFAULT_LIST_LIMIT
    assert second.json()["page"] == 2
    assert {i["id"] for i in second.json()["items"]}.isdisjoint({i["id"] for i in body["items"]})


@pytest.mark.anyio
async def test_page_past_the_end_is_empty_but_total_still_counts_every_match(client, db_session):
    people = await _seed(db_session, count=6)

    response = await client.get("/api/people", params={"limit": 4, "page": 5}, headers=ADMIN_HEADERS)

    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == len(people)


@pytest.mark.anyio
async def test_volunteers_and_people_share_one_q_semantics(client, db_session):
    """`q` reaches club, notes, phone and roles on both lists, not just the
    name/address/NISS/eID subset volunteers used to search."""
    db_session.add_all(
        [
            Person(id="per_a", name="Aaa", roles=["volunteer"], club_name="Zymurgy Club"),
            Person(id="per_b", name="Bbb", roles=["volunteer"], notes="knows the zymurgy basics"),
            Person(id="per_c", name="Ccc", roles=["volunteer"], phone="+32 400 11 22 33"),
            Person(id="per_d", name="Ddd", roles=["member"], club_name="Zymurgy Club"),
            Person(id="per_e", name="Eee", roles=["volunteer"]),
        ]
    )
    await db_session.commit()

    for q, expected_people, expected_volunteers in [
        ("zymurgy", {"per_a", "per_b", "per_d"}, {"per_a", "per_b"}),
        ("400 11", {"per_c"}, {"per_c"}),
        ("volunteer", {"per_a", "per_b", "per_c", "per_e"}, {"per_a", "per_b", "per_c", "per_e"}),
    ]:
        people = await client.get("/api/people", params={"q": q}, headers=ADMIN_HEADERS)
        volunteers = await client.get("/api/volunteers", params={"q": q}, headers=ADMIN_HEADERS)
        assert {i["id"] for i in people.json()["items"]} == expected_people, q
        assert {i["id"] for i in volunteers.json()["items"]} == expected_volunteers, q
        assert people.json()["total"] == len(expected_people)
        assert volunteers.json()["total"] == len(expected_volunteers)


@pytest.mark.anyio
async def test_whitespace_only_q_is_treated_as_omitted(client, db_session):
    people = await _seed(db_session, count=6)

    response = await client.get("/api/people", params={"q": "   "}, headers=ADMIN_HEADERS)

    assert response.status_code == 200
    assert response.json()["total"] == len(people)


@pytest.mark.anyio
async def test_mcp_member_and_volunteer_lists_share_the_people_q_semantics(client, db_session):
    """The MCP list tools filter through the same people contract as the REST
    lists, so `q` reaches NISS, eID and roles there too, not a narrower subset."""
    from tests.helpers import mcp_session_factory

    db_session.add_all(
        [
            Person(id="per_m1", name="Mia", roles=["member"], national_register_number="91010112345"),
            Person(id="per_m2", name="Max", roles=["member"], eid_document_number="BEX999"),
            Person(id="per_v1", name="Vic", roles=["volunteer"], national_register_number="91010112399"),
        ]
    )
    await db_session.commit()
    factory = mcp_session_factory(db_session)

    from app.mcp.admin import members as mcp_members
    from app.mcp.admin import volunteers as mcp_volunteers

    for q, members, volunteers in [("910101123", {"per_m1"}, {"per_v1"}), ("bex999", {"per_m2"}, set())]:
        rest = await client.get("/api/people", params={"q": q, "role": "member"}, headers=ADMIN_HEADERS)
        listed_members = await mcp_members.list_members(factory, q=q)
        listed_volunteers = await mcp_volunteers.list_volunteers(factory, q=q)
        assert {i["id"] for i in rest.json()["items"]} == members, q
        assert {m["id"] for m in listed_members["members"]} == members, q
        assert {v["id"] for v in listed_volunteers["volunteers"]} == volunteers, q
