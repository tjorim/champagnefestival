from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.utils import registration_to_guest_dict


def _registration_with_backrefs(*, person=True, event=True):
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
        _person=SimpleNamespace(name="Jean Dupont") if person else None,
        _event=SimpleNamespace(title="Friday Tasting") if event else None,
    )


def test_registration_to_guest_dict_requires_person_backref():
    with pytest.raises(ValueError, match="has no attached _person"):
        registration_to_guest_dict(_registration_with_backrefs(person=False))


def test_registration_to_guest_dict_requires_event_backref():
    with pytest.raises(ValueError, match="has no attached _event"):
        registration_to_guest_dict(_registration_with_backrefs(event=False))
