"""Member mailings: the composer email channel and the address suppression list (#1407).

Revision ID: 014
Revises: 013
"""

import sqlalchemy as sa

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "composed_messages",
        sa.Column(
            "email_category_key",
            sa.String(50),
            sa.ForeignKey("email_categories.key", name="fk_composed_messages_email_category", ondelete="RESTRICT"),
        ),
    )
    op.add_column("composed_messages", sa.Column("email_audience_snapshot", sa.JSON()))
    op.create_table(
        "email_suppressions",
        sa.Column("address_hash", sa.String(64), primary_key=True),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("reason IN ('hard_bounce', 'complaint')", name="ck_email_suppressions_reason"),
    )


def downgrade():
    op.drop_table("email_suppressions")
    op.drop_column("composed_messages", "email_audience_snapshot")
    op.drop_constraint("fk_composed_messages_email_category", "composed_messages", type_="foreignkey")
    op.drop_column("composed_messages", "email_category_key")
