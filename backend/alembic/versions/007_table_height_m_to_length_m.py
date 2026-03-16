"""Rename tables.height_m to length_m

height_m was ambiguous (could mean standing height vs tabletop dimension).
length_m clearly refers to the second tabletop dimension (width × length footprint).

Revision ID: 007
Revises: 006
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tables") as batch_op:
        batch_op.alter_column("height_m", new_column_name="length_m", existing_type=sa.Float, existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("tables") as batch_op:
        batch_op.alter_column("length_m", new_column_name="height_m", existing_type=sa.Float, existing_nullable=False)
