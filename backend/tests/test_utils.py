from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.utils import registration_to_guest_dict


def _make_registration():
    now = datetime.now(UTC)
    return SimpleNamespace(
        id="reg_test",
        person_id="per_test",
        event_id="evt_test",
        guest_count=2,
        pre_orders=[],
        status="confirmed",
        payment_status="paid",
        checked_in=False,
        checked_in_at=None,
        strap_issued=False,
        created_at=now,
    )


def _make_person(name: str = "Jean Dupont"):
    return SimpleNamespace(name=name)


def _make_event(title: str = "Friday Tasting"):
    return SimpleNamespace(title=title)


def test_registration_to_guest_dict_includes_person_name():
    r = _make_registration()
    result = registration_to_guest_dict(r, _make_person("Alice"), _make_event())
    assert result["name"] == "Alice"


def test_registration_to_guest_dict_includes_event_title():
    r = _make_registration()
    result = registration_to_guest_dict(r, _make_person(), _make_event("Saturday Gala"))
    assert result["event_title"] == "Saturday Gala"
