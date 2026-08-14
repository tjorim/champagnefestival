"""Renormalise Person.national_register_number/eid_document_number.

`app.services.people_service.normalise_optional_identity` strips separators
(space/dot/hyphen/slash) and lowercases these two columns before storing them
and before checking `people`'s unique constraints on them. Until #866,
`app.services.members_service`/`app.services.volunteers_service` only
stripped surrounding whitespace before storing — e.g. a member created with
`"93.05.18-223.61"` and a person created with `"93051822361"` were the same
real-world identity but compared unequal, so both could exist and the unique
constraint never caught the collision.

This renormalises every existing row to the stricter form so the constraint
stays valid once all three call sites agree on it. A row is only rewritten
when renormalising doesn't collide with another row's *already-normalised*
value — a genuine pre-existing duplicate identity that only differed by
formatting is left as-is (both flavours of case predate this migration
either way) rather than silently merged; see
`app.services.people_service.merge_people` for resolving those by hand. Scans
`national_register_number`/`eid_document_number` independently since a
collision on one column doesn't imply a collision on the other.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = ("national_register_number", "eid_document_number")


def _normalise(value: str) -> str:
    for ch in (" ", ".", "-", "/"):
        value = value.replace(ch, "")
    value = value.strip().lower()
    return value


def upgrade() -> None:
    conn = op.get_bind()
    people = sa.table(
        "people",
        sa.column("id", sa.String),
        sa.column("national_register_number", sa.String),
        sa.column("eid_document_number", sa.String),
    )

    for column_name in _COLUMNS:
        column = people.c[column_name]
        rows = conn.execute(sa.select(people.c.id, column).where(column.isnot(None))).all()

        by_normalised: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for row_id, raw_value in rows:
            normalised = _normalise(raw_value)
            if normalised:
                by_normalised[normalised].append((row_id, raw_value))

        for normalised_value, entries in by_normalised.items():
            if len(entries) > 1:
                # Genuine pre-existing duplicate identity across differently
                # formatted values — applying the stricter form here would
                # violate the column's unique constraint. Leave these rows
                # untouched; they need a manual merge_people call, not a
                # migration silently picking a winner.
                continue
            row_id, raw_value = entries[0]
            if raw_value == normalised_value:
                continue
            conn.execute(people.update().where(people.c.id == row_id).values(**{column_name: normalised_value}))


def downgrade() -> None:
    # Renormalisation discards the original separator/casing, so there's no
    # recorded prior value to restore. The renormalised form is still a
    # valid, equivalent identity value, so leaving it in place on downgrade
    # is safe — there is nothing else for this step to reasonably do.
    pass
