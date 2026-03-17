"""Add people table plus reservation-person linkage.

Revision ID: 005
Revises: 004
Create Date: 2026-03-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("person_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("phone", sa.String(length=50), nullable=False, server_default=""),
        sa.Column("address", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("roles", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("first_help_day", sa.Date(), nullable=True),
        sa.Column("last_help_day", sa.Date(), nullable=True),
        sa.Column("national_register_number", sa.String(length=20), nullable=True),
        sa.Column("eid_document_number", sa.String(length=50), nullable=True),
        sa.Column("visits_per_month", sa.Integer(), nullable=True),
        sa.Column("club_name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_key"),
        sa.UniqueConstraint("national_register_number"),
        sa.UniqueConstraint("eid_document_number"),
    )

    op.add_column(
        "reservations",
        sa.Column("person_id", sa.String(length=64), nullable=True),
    )

    with op.batch_alter_table("reservations") as batch_op:
        batch_op.create_foreign_key(
            "fk_reservations_person_id_people",
            "people",
            ["person_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("reservations") as batch_op:
        batch_op.drop_constraint("fk_reservations_person_id_people", type_="foreignkey")
    op.drop_column("reservations", "person_id")
    op.drop_table("people")
