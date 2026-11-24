"""The public-tier MCP tools: editions, schedule, venue plan and stand lookup."""

from __future__ import annotations

from datetime import date, time
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.mcp.server import (
    ChampagneFestivalMcpBackend,
)
from app.mcp.utils import get_active_edition_obj
from tests.helpers import ADMIN_HEADERS, VENUE_PAYLOAD, mcp_session_factory
from tests.mcp_fakes import make_db_execute, make_edition, make_event, make_layout, make_session_factory, make_venue

# ---------------------------------------------------------------------------
# list_editions
# ---------------------------------------------------------------------------


class TestListEditions:
    @pytest.mark.anyio
    async def test_returns_editions_in_chronological_order(self):
        past_event = make_event(event_id="ev-past", event_date=date(2025, 10, 18))
        upcoming_event = make_event(event_id="ev-upcoming", event_date=date(2026, 3, 21))
        past = make_edition(edition_id="2025-october", year=2025, month="october", active=False, events=[past_event])
        upcoming = make_edition(events=[upcoming_event])

        db = make_db_execute([[upcoming, past]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.list_editions()

        assert result["count"] == 2
        assert result["editions"] == [
            {
                "id": "2025-october",
                "year": 2025,
                "type": "festival",
                "date_range": {"start": "2025-10-18", "end": "2025-10-18"},
                "is_active": False,
            },
            {
                "id": "2026-march",
                "year": 2026,
                "type": "festival",
                "date_range": {"start": "2026-03-21", "end": "2026-03-21"},
                "is_active": True,
            },
        ]

    @pytest.mark.anyio
    async def test_returns_empty_list_when_no_editions_exist(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.list_editions()
        assert result == {"editions": [], "count": 0}


# ---------------------------------------------------------------------------
# get_active_edition
# ---------------------------------------------------------------------------


class TestGetActiveEdition:
    @pytest.mark.anyio
    async def test_returns_active_edition(self):
        ev = make_event(event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])

        db = make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_active_edition()
        ae = result["active_edition"]
        assert ae["id"] == "2026-march"
        assert ae["year"] == 2026
        assert ae["month"] == "march"
        assert ae["event_count"] == 1
        assert "2099-03-21" in ae["dates"]

    @pytest.mark.anyio
    async def test_returns_empty_when_no_active_editions(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_active_edition()
        assert result["active_edition"] is None
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_empty_when_all_editions_past(self):
        ev = make_event(event_date=date(2000, 1, 1))
        edition = make_edition(events=[ev])
        db = make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_active_edition()
        assert result["active_edition"] is None

    @pytest.mark.anyio
    async def test_edition_without_events_treated_as_no_upcoming(self):
        edition = make_edition(events=[])
        db = make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_active_edition()
        assert result["active_edition"] is None


# ---------------------------------------------------------------------------
# get_active_edition_obj — edition_type scoping against real mixed data
# ---------------------------------------------------------------------------


class TestGetActiveEditionObjEditionTypeScoping:
    """Exercises `get_active_edition_obj` against a real DB session (not the MagicMock
    fixtures used above) so the actual SQL `edition_type` filter is under test, using a
    mix of active festival, Bourse, and capsule-exchange editions.
    """

    async def _seed_mixed_editions(self, client) -> None:
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
                    "title_nl": f"{edition_type} event",
                    "date": event_date,
                    "start_time": "18:00",
                    "end_time": "22:00",
                    "category": "general",
                    "registration_required": False,
                    "active": True,
                },
                headers=ADMIN_HEADERS,
            )
            assert event_response.status_code == 201

    @pytest.mark.anyio
    async def test_default_selects_festival_over_nearer_bourse_and_capsule_exchange(self, client, db_session):
        await self._seed_mixed_editions(client)

        edition = await get_active_edition_obj(db_session)

        assert edition is not None
        assert edition.id == "edition-festival-farthest"

    @pytest.mark.anyio
    async def test_explicit_type_none_falls_back_to_nearest_ending_edition_of_any_type(self, client, db_session):
        await self._seed_mixed_editions(client)

        edition = await get_active_edition_obj(db_session, edition_type=None)

        assert edition is not None
        assert edition.id == "edition-bourse-nearest"

    @pytest.mark.anyio
    async def test_explicit_type_selects_that_type(self, client, db_session):
        await self._seed_mixed_editions(client)

        edition = await get_active_edition_obj(db_session, edition_type="capsule_exchange")

        assert edition is not None
        assert edition.id == "edition-capsule-exchange-mid"

    @pytest.mark.anyio
    async def test_mcp_get_active_edition_tool_never_returns_a_community_edition(self, client, db_session):
        await self._seed_mixed_editions(client)

        backend = ChampagneFestivalMcpBackend(make_session_factory(db_session))
        result = await backend.get_active_edition()

        assert result["active_edition"]["id"] == "edition-festival-farthest"


# ---------------------------------------------------------------------------
# get_event_schedule
# ---------------------------------------------------------------------------


class TestGetEventSchedule:
    @pytest.mark.anyio
    async def test_returns_events_for_active_edition(self):
        ev1 = make_event(event_id="ev-1", event_date=date(2099, 3, 21))
        ev2 = make_event(event_id="ev-2", event_date=date(2099, 3, 22))
        edition = make_edition(events=[ev1, ev2])

        db = make_db_execute([[edition], [edition]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_event_schedule()
        assert result["edition_id"] == "2026-march"
        assert len(result["events"]) == 2

    @pytest.mark.anyio
    async def test_returns_events_for_specific_edition(self):
        ev = make_event(event_id="ev-1", event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])

        db = make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_event_schedule(edition_id="2026-march")
        assert result["edition_id"] == "2026-march"
        assert len(result["events"]) == 1
        assert result["events"][0]["id"] == "ev-1"

    @pytest.mark.anyio
    async def test_returns_empty_when_edition_not_found(self):
        db = make_db_execute([[None]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_event_schedule(edition_id="nonexistent")
        assert result["events"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_empty_when_no_active_edition(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_event_schedule()
        assert result["events"] == []


# ---------------------------------------------------------------------------
# get_venue_plan_summary
# ---------------------------------------------------------------------------


class TestGetVenuePlanSummary:
    @pytest.mark.anyio
    async def test_returns_empty_when_no_active_edition(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_venue_plan_summary()
        assert result["rooms"] == []

    @pytest.mark.anyio
    async def test_returns_room_names_without_table_counts(self):
        """Room names are public; table counts and any other capacity/attendance
        numbers stay behind the volunteer/admin tier (see get_table_seating and
        the full /api/venue-plan/{edition_id} REST endpoint)."""
        ev = make_event(event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])
        layout = make_layout()
        venue = make_venue()
        # Mock execute returns: editions, venue, layouts (no table-count query)

        call_count = [0]

        async def _execute(_stmt):
            idx = call_count[0]
            call_count[0] += 1
            result = MagicMock()
            if idx == 0:
                # SELECT editions
                scalars = MagicMock()
                scalars.all = MagicMock(return_value=[edition])
                result.scalars = MagicMock(return_value=scalars)
            elif idx == 1:
                # SELECT venue
                result.scalar_one_or_none = MagicMock(return_value=venue)
            elif idx == 2:
                # SELECT layouts
                scalars = MagicMock()
                scalars.all = MagicMock(return_value=[layout])
                result.scalars = MagicMock(return_value=scalars)
            return result

        db = MagicMock()
        db.execute = _execute
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.get_venue_plan_summary()
        assert result["edition_id"] == "2026-march"
        assert result["venue_name"] == "Salle des Fêtes"
        assert "total_tables" not in result
        assert len(result["rooms"]) == 1
        assert result["rooms"][0]["room_name"] == "Main Hall"
        assert "table_count" not in result["rooms"][0]


class TestGetEventScheduleLocale:
    async def test_schedule_resolves_titles_for_the_requested_locale(self, db_session):
        from app.mcp.public import get_event_schedule
        from app.models import Edition, Event, Venue

        db_session.add(Venue(id="venue-schedule", name="Venue"))
        await db_session.flush()
        db_session.add(Edition(id="schedule-edition", year=2099, month="march", venue_id="venue-schedule"))
        await db_session.flush()
        db_session.add(
            Event(
                id="evt-schedule",
                edition_id="schedule-edition",
                title_nl="Proeverij",
                title_en="Tasting",
                date=date(2099, 3, 21),
                start_time=time.fromisoformat("18:00"),
                category="tasting",
            )
        )
        await db_session.flush()
        factory = mcp_session_factory(db_session)

        english = (await get_event_schedule(factory, "schedule-edition", "en"))["events"][0]
        french = (await get_event_schedule(factory, "schedule-edition", "fr"))["events"][0]
        original = (await get_event_schedule(factory, "schedule-edition"))["events"][0]

        assert english["title"] == "Tasting"
        assert french["title"] == "Proeverij"  # no French translation: falls back to the original
        assert original["title"] == "Proeverij"
        assert original["title_en"] == "Tasting"


# ---------------------------------------------------------------------------
# find_stand (#1223)
# ---------------------------------------------------------------------------


class TestFindProducerStand:
    @pytest.mark.anyio
    async def test_returns_message_when_no_active_edition(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        result = await backend.find_stand()
        assert result["organizations"] == []
        assert "No active edition" in result["message"]

    @pytest.mark.anyio
    async def test_filters_by_name_and_returns_only_the_public_subset(self, monkeypatch):
        stands = {
            "edition_id": "2026-march",
            "organizations": [
                {
                    "organization_id": 1,
                    "name": "Bollinger",
                    "stands": [
                        {"event_id": "e1", "date": date(2099, 3, 20), "room_name": "Hall 5", "label": "Stand 12"}
                    ],
                },
                {"organization_id": 2, "name": "Krug", "stands": []},
            ],
        }
        edition = make_edition(events=[make_event(event_date=date(2099, 3, 21))])
        db = MagicMock()
        db.get = AsyncMock(return_value=edition)

        async def _load(_db, _edition):
            from app.schemas import EditionStandsOut

            return EditionStandsOut.model_validate(stands)

        monkeypatch.setattr("app.mcp.public.load_edition_stands", _load)
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))

        result = await backend.find_stand(query="  bolli ", edition_id="2026-march")

        assert result["count"] == 1
        assert result["organizations"][0]["name"] == "Bollinger"
        assert result["organizations"][0]["stands"][0]["label"] == "Stand 12"
        everything = await backend.find_stand(edition_id="2026-march")
        assert everything["count"] == 2
