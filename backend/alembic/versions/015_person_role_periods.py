"""Store directory role periods relationally.

Revision ID: 015
Revises: 014
"""

from datetime import date

import sqlalchemy as sa

from alembic import op
from app.db.member_email_index import POSTGRES_MEMBER_EMAIL_STATEMENTS

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None

_ALIASES = {
    "member": "member",
    "lid": "member",
    "membre": "member",
    "volunteer": "volunteer",
    "vrijwilliger": "volunteer",
    "benevole": "volunteer",
    "bénévole": "volunteer",
}


def _role(value: object) -> str | None:
    return _ALIASES.get(value.strip().lower()) if isinstance(value, str) else None


def _day(value: object) -> date | None:
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    return None


def _object(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _periods(roles: object, retired: object, history: object, today: date):
    held = {role for item in roles if (role := _role(item))} if isinstance(roles, list) else set()
    retirements = {
        role: _day(value) or today
        for key, value in _object(retired).items()
        if (role := _role(key)) and value is not None
    }
    stretches: dict[str, list[tuple[date | None, date | None]]] = {}
    # When aliases coexist, prefer the canonical key's history as the latest history.
    for key, entries in sorted(_object(history).items(), key=lambda item: item[0] in ("member", "volunteer")):
        if (role := _role(key)) and isinstance(entries, list):
            for entry in entries:
                if not isinstance(entry, dict) or not (entry.keys() & {"started_on", "ended_on"}):
                    continue
                start, end = _day(entry.get("started_on")), _day(entry.get("ended_on"))
                if entry.get("ended_on") is not None and end is None:
                    continue
                if start and end and start > end:
                    start = None
                stretches.setdefault(role, []).append((start, end))
    for role in sorted(held | retirements.keys() | stretches.keys()):
        periods = stretches.get(role) or [(None, retirements.get(role))]
        removed = role not in held and role not in retirements and periods[-1][1] is not None
        for position, (start, end) in enumerate(periods):
            latest = position == len(periods) - 1
            if not latest and end is None:
                end = max(start or date.min, periods[position + 1][0] or today)
            yield {
                "role": role,
                "position": position,
                "started_on": start,
                "ended_on": end,
                "removed": latest and removed,
            }


def upgrade() -> None:
    conn = op.get_bind()
    op.execute("LOCK TABLE people IN ACCESS EXCLUSIVE MODE")
    periods = op.create_table(
        "person_role_periods",
        sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.String(20), primary_key=True),
        sa.Column("position", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("started_on", sa.Date()),
        sa.Column("ended_on", sa.Date()),
        sa.Column("removed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("member_email", sa.String(320)),
        sa.CheckConstraint("role IN ('member', 'volunteer')", name="ck_person_role_periods_role"),
        sa.CheckConstraint("NOT removed OR ended_on IS NOT NULL", name="ck_person_role_periods_removed"),
    )
    today = conn.execute(sa.text("SELECT CURRENT_DATE")).scalar_one()
    # Alias normalisation can uncover collisions. Prefer the previously indexed
    # member, then the oldest person. Retire the other period without losing it.
    people = conn.execute(
        sa.text("""
        SELECT id, trim(email) AS member_email, lower(trim(email)) AS email_key,
               anonymised, roles, retired_roles, role_history,
               CAST(roles AS text) LIKE '%"member"%' AS legacy_member
        FROM people
        ORDER BY created_at, id
    """)
    ).mappings()
    # Inspect JSON in Python, including JSON strings with escapes PostgreSQL
    # refuses to convert to text with ->>.
    people = sorted(
        people,
        key=lambda person: not (person["legacy_member"] and _object(person["retired_roles"]).get("member") is None),
    )
    claimed: set[str] = set()
    for offset in range(0, len(people), 500):
        batch = people[offset : offset + 500]
        rows = []
        for person in batch:
            for period in _periods(person["roles"], person["retired_roles"], person["role_history"], today):
                key = person["email_key"]
                member_email = None
                if period["role"] == "member" and period["ended_on"] is None and not person["anonymised"] and key:
                    if key in claimed:
                        period["ended_on"] = max(period["started_on"] or date.min, today)
                    else:
                        claimed.add(key)
                        member_email = person["member_email"]
                rows.append({"person_id": person["id"], "member_email": member_email, **period})
        if rows:
            conn.execute(periods.insert(), rows)

    op.drop_index("uq_people_current_member_email", table_name="people")
    op.create_index(
        "uq_people_current_member_email", "person_role_periods", [sa.text("lower(member_email)")], unique=True
    )
    op.create_index("ix_person_role_periods_role_person", "person_role_periods", ["role", "person_id"])
    op.create_index(
        "uq_person_role_periods_open",
        "person_role_periods",
        ["person_id", "role"],
        unique=True,
        postgresql_where=sa.text("ended_on IS NULL"),
    )
    for statement in POSTGRES_MEMBER_EMAIL_STATEMENTS:
        op.execute(statement)
    for column in ("roles", "retired_roles", "role_history"):
        op.drop_column("people", column)


def downgrade() -> None:
    # Reconstruct canonical JSON. Dropped unknown values and normalized aliases
    # require restoring the pre-upgrade backup.
    for column, default in (("roles", "'[]'::jsonb"), ("retired_roles", "'{}'"), ("role_history", "'{}'")):
        op.add_column("people", sa.Column(column, sa.JSON(), nullable=False, server_default=sa.text(default)))
    op.execute("""
        WITH role_summary AS (
            SELECT person_id, role,
                   json_agg(json_build_object('started_on', started_on, 'ended_on', ended_on)
                            ORDER BY position) AS history,
                   (array_agg(removed ORDER BY position DESC))[1] AS removed,
                   (array_agg(ended_on ORDER BY position DESC))[1] AS ended_on
            FROM person_role_periods
            GROUP BY person_id, role
        ), person_summary AS (
            SELECT person_id,
                   coalesce(json_agg(role ORDER BY role) FILTER (WHERE NOT removed), '[]') AS roles,
                   coalesce(json_object_agg(role, ended_on) FILTER (WHERE NOT removed AND ended_on IS NOT NULL),
                            '{}') AS retired_roles,
                   json_object_agg(role, history) AS role_history
            FROM role_summary
            GROUP BY person_id
        )
        UPDATE people
        SET roles = person_summary.roles, retired_roles = person_summary.retired_roles,
            role_history = person_summary.role_history
        FROM person_summary WHERE people.id = person_summary.person_id
    """)
    for column in ("retired_roles", "role_history"):
        op.alter_column("people", column, server_default=None)
    op.execute("DROP TRIGGER refresh_period_member_email ON people")
    op.drop_table("person_role_periods")
    op.execute("DROP FUNCTION refresh_period_member_email()")
    op.execute("DROP FUNCTION set_period_member_email()")
    op.create_index(
        "uq_people_current_member_email",
        "people",
        [sa.text("lower(trim(email))")],
        unique=True,
        postgresql_where=sa.text(
            """NOT anonymised AND CAST(roles AS text) LIKE '%"member"%'
            AND retired_roles ->> 'member' IS NULL AND trim(email) <> ''"""
        ),
    )
