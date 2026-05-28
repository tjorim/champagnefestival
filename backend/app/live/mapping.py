"""Domain-action to LiveEvent mapping.

This module is the single source of truth for which TanStack Query keys
are invalidated by each domain action.  The ``keys`` list produced here
must stay in sync with ``frontend/src/utils/queryKeys.ts``.
"""

from __future__ import annotations

from app.live.events import LiveEvent, LiveScope
from app.utils import make_id

# ---------------------------------------------------------------------------
# TanStack Query key constants — must match frontend/src/utils/queryKeys.ts
# ---------------------------------------------------------------------------

_K_ADMIN_REGISTRATIONS: tuple[str, ...] = ("admin", "registrations")
_K_ADMIN_TABLES: tuple[str, ...] = ("admin", "tables")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _event(
    topic: str,
    action: str,
    scope: LiveScope,
    keys: tuple[tuple[str, ...], ...],
) -> LiveEvent:
    return LiveEvent(
        topic=topic,
        action=action,
        scope=scope,
        keys=keys,
        id=make_id("evt"),
    )


# ---------------------------------------------------------------------------
# Public mapping functions (called by mutation routes after db.commit())
# ---------------------------------------------------------------------------


def check_in_changed(
    *,
    registration_id: str,
    event_id: str | None = None,
    edition_id: str | None = None,
) -> LiveEvent:
    """Registration was checked in or a strap was issued."""
    return _event(
        topic="check_in",
        action="updated",
        scope=LiveScope(
            edition_id=edition_id,
            event_id=event_id,
            registration_id=registration_id,
        ),
        keys=(_K_ADMIN_REGISTRATIONS,),
    )


def registration_changed(
    *,
    action: str,
    registration_id: str | None = None,
    event_id: str | None = None,
    edition_id: str | None = None,
) -> LiveEvent:
    """A registration was created, updated (status/notes/payment), or deleted."""
    return _event(
        topic="registration",
        action=action,
        scope=LiveScope(
            edition_id=edition_id,
            event_id=event_id,
            registration_id=registration_id,
        ),
        keys=(_K_ADMIN_REGISTRATIONS,),
    )


def seating_changed(
    *,
    action: str = "updated",
    registration_id: str | None = None,
    table_id: str | None = None,
    event_id: str | None = None,
    edition_id: str | None = None,
) -> LiveEvent:
    """Table assignment or table layout changed."""
    return _event(
        topic="seating",
        action=action,
        scope=LiveScope(
            edition_id=edition_id,
            event_id=event_id,
            registration_id=registration_id,
            table_id=table_id,
        ),
        keys=(_K_ADMIN_REGISTRATIONS, _K_ADMIN_TABLES),
    )


def order_changed(
    *,
    action: str = "updated",
    registration_id: str | None = None,
    event_id: str | None = None,
    edition_id: str | None = None,
) -> LiveEvent:
    """Pre-order quantities changed on a registration."""
    return _event(
        topic="order",
        action=action,
        scope=LiveScope(
            edition_id=edition_id,
            event_id=event_id,
            registration_id=registration_id,
        ),
        keys=(_K_ADMIN_REGISTRATIONS,),
    )


def delivery_changed(
    *,
    registration_id: str | None = None,
    event_id: str | None = None,
    edition_id: str | None = None,
) -> LiveEvent:
    """Champagne delivery quantities changed on a registration."""
    return _event(
        topic="delivery",
        action="updated",
        scope=LiveScope(
            edition_id=edition_id,
            event_id=event_id,
            registration_id=registration_id,
        ),
        keys=(_K_ADMIN_REGISTRATIONS,),
    )
