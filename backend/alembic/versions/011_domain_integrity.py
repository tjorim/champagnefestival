"""Database-level domain constraints and a relational edition lineup.

- CHECK constraints for registration/payment status and edition type
- ``edition_organizations`` replaces the ``editions.organizations``/``sponsor_tiers`` JSON columns, so the
  lineup has foreign keys (ids with no matching organization are dropped while copying)

Revision ID: 011
Revises: 010
"""

import sqlalchemy as sa

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None

_CHECKS = (
    ("registrations", "ck_registrations_status", "status IN ('pending', 'confirmed', 'cancelled')"),
    ("registrations", "ck_registrations_payment_status", "payment_status IN ('unpaid', 'partial', 'paid')"),
    ("editions", "ck_editions_edition_type", "edition_type IN ('festival', 'bourse', 'capsule_exchange')"),
)


def _upgrade_lineup() -> None:
    op.create_table(
        "edition_organizations",
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sponsor_tier", sa.String(20), nullable=True),
        sa.CheckConstraint(
            "sponsor_tier IS NULL OR sponsor_tier IN ('main', 'partner', 'supporter')",
            name="ck_edition_organizations_sponsor_tier",
        ),
    )
    op.create_index("ix_edition_organizations_organization_id", "edition_organizations", ["organization_id"])
    bind = op.get_bind()
    editions = sa.table(
        "editions", sa.column("id", sa.String), sa.column("organizations", sa.JSON), sa.column("sponsor_tiers", sa.JSON)
    )
    known = {row[0] for row in bind.execute(sa.text("SELECT id FROM organizations"))}
    lineup = sa.table(
        "edition_organizations",
        sa.column("edition_id", sa.String),
        sa.column("organization_id", sa.Integer),
        sa.column("position", sa.Integer),
        sa.column("sponsor_tier", sa.String),
    )
    rows = []
    for edition_id, organizations, tiers in bind.execute(
        sa.select(editions.c.id, editions.c.organizations, editions.c.sponsor_tiers)
    ):
        tiers = tiers or {}
        seen: set[int] = set()
        for organization_id in organizations or []:
            if organization_id in known and organization_id not in seen:
                seen.add(organization_id)
                rows.append(
                    {
                        "edition_id": edition_id,
                        "organization_id": organization_id,
                        "position": len(seen) - 1,
                        "sponsor_tier": tiers.get(str(organization_id)),
                    }
                )
    if rows:
        op.bulk_insert(lineup, rows)
    with op.batch_alter_table("editions") as batch:
        batch.drop_column("organizations")
        batch.drop_column("sponsor_tiers")


def _downgrade_lineup() -> None:
    with op.batch_alter_table("editions") as batch:
        batch.add_column(sa.Column("organizations", sa.JSON(), nullable=False, server_default="[]"))
        batch.add_column(sa.Column("sponsor_tiers", sa.JSON(), nullable=False, server_default="{}"))
    bind = op.get_bind()
    lineups: dict[str, list[tuple[int, str | None]]] = {}
    for edition_id, organization_id, tier in bind.execute(
        sa.text("SELECT edition_id, organization_id, sponsor_tier FROM edition_organizations ORDER BY position")
    ):
        lineups.setdefault(edition_id, []).append((organization_id, tier))
    editions = sa.table(
        "editions", sa.column("id", sa.String), sa.column("organizations", sa.JSON), sa.column("sponsor_tiers", sa.JSON)
    )
    for edition_id, entries in lineups.items():
        bind.execute(
            sa.update(editions)
            .where(editions.c.id == edition_id)
            .values(
                organizations=[organization_id for organization_id, _ in entries],
                sponsor_tiers={str(organization_id): tier for organization_id, tier in entries if tier},
            )
        )
    op.drop_table("edition_organizations")


def _check_existing_values() -> None:
    """Fail with a readable list before any DDL if a row would violate a new constraint."""
    bind = op.get_bind()
    problems = []
    for table, name, condition in _CHECKS:
        count = bind.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE NOT COALESCE(({condition}), false)")
        ).scalar_one()
        if count:
            problems.append(f"{count} row(s) in {table} violate {name} ({condition})")
    if problems:
        raise RuntimeError("Fix these rows before upgrading to 011: " + "; ".join(problems))


def upgrade() -> None:
    _check_existing_values()
    for table, name, condition in _CHECKS:
        with op.batch_alter_table(table) as batch:
            batch.create_check_constraint(name, sa.text(condition))
    _upgrade_lineup()


def downgrade() -> None:
    _downgrade_lineup()
    for table, name, _ in reversed(_CHECKS):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(name, type_="check")
