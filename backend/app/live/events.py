"""Live-update event envelope for the notify-then-pull SSE stream."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass(frozen=True)
class LiveScope:
    """Scoping identifiers that narrow which entity was affected."""

    edition_id: str | None = None
    event_id: str | None = None
    registration_id: str | None = None
    table_id: str | None = None


@dataclass(frozen=True)
class LiveEvent:
    """Immutable invalidation envelope streamed to connected clients.

    Clients receive this envelope and call queryClient.invalidateQueries
    for each entry in ``keys``.  No entity body is included; the client
    always re-fetches from the REST API (notify-then-pull pattern).
    """

    topic: str  # "check_in" | "seating" | "order" | "delivery" | "registration"
    action: str  # "created" | "updated" | "deleted"
    scope: LiveScope
    keys: tuple[tuple[str, ...], ...]
    ts: datetime = field(default_factory=lambda: datetime.now(UTC))
    id: str = ""

    def to_sse_data(self) -> str:
        """Return the SSE-formatted message string for this event."""
        payload = {
            "topic": self.topic,
            "action": self.action,
            "scope": {
                "edition_id": self.scope.edition_id,
                "event_id": self.scope.event_id,
                "registration_id": self.scope.registration_id,
                "table_id": self.scope.table_id,
            },
            "keys": [list(k) for k in self.keys],
            "ts": self.ts.isoformat(),
            "id": self.id,
        }
        data = json.dumps(payload, separators=(",", ":"))
        id_line = f"id: {self.id}\n" if self.id else ""
        return f"event: invalidate\n{id_line}data: {data}\n\n"
