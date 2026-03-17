"""Change tables.rotation from Float to Integer

Revision ID: 006
Revises: 005
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Round any existing fractional rotation values into whole degrees within
    # [0, 359] before converting the column type from Float to Integer.
    op.execute(
        "UPDATE tables SET rotation = CAST(ROUND(rotation) % 360 AS INTEGER) WHERE rotation IS NOT NULL"
    )
    with op.batch_alter_table("tables") as batch_op:
        batch_op.alter_column(
            "rotation",
            type_=sa.Integer,
            existing_type=sa.Float,
            existing_nullable=False,
            existing_server_default="0",
        )


def downgrade() -> None:
    with op.batch_alter_table("tables") as batch_op:
        batch_op.alter_column(
            "rotation",
            type_=sa.Float,
            existing_type=sa.Integer,
            existing_nullable=False,
            existing_server_default="0",
        )
