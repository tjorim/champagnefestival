"""Capsule exchange stamp cards and rewards.

Revision ID: 011
Revises: 010
"""

import sqlalchemy as sa

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def labels():
    return [
        sa.Column("reward_label_nl", sa.String(200), nullable=False),
        sa.Column("reward_label_fr", sa.String(200)),
        sa.Column("reward_label_en", sa.String(200)),
    ]


def upgrade():
    op.create_table(
        "stamp_card_types",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name_nl", sa.String(200), nullable=False),
        sa.Column("name_fr", sa.String(200)),
        sa.Column("name_en", sa.String(200)),
        sa.Column("box_count", sa.Integer(), nullable=False),
        *labels(),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint("box_count > 0", name="ck_stamp_card_type_boxes"),
        sa.CheckConstraint(
            "length(trim(name_nl)) > 0 AND length(trim(reward_label_nl)) > 0", name="ck_stamp_card_type_nl"
        ),
    )
    op.create_table(
        "stamp_cards",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("type_id", sa.String(64), sa.ForeignKey("stamp_card_types.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("box_count", sa.Integer(), nullable=False),
        *labels(),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("box_count > 0", name="ck_stamp_card_boxes"),
    )
    op.create_index("ix_stamp_cards_person_id", "stamp_cards", ["person_id"])
    op.create_table(
        "stamps",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("card_id", sa.String(64), sa.ForeignKey("stamp_cards.id", ondelete="RESTRICT"), nullable=False),
        sa.Column(
            "registration_id",
            sa.String(64),
            sa.ForeignKey("registrations.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_stamps_card_id", "stamps", ["card_id"])
    op.create_table(
        "stamp_card_rewards",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "card_id", sa.String(64), sa.ForeignKey("stamp_cards.id", ondelete="RESTRICT"), nullable=False, unique=True
        ),
        *labels(),
        sa.Column("earned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("handed_out_at", sa.DateTime(timezone=True)),
        sa.Column("handed_out_by", sa.String(200)),
    )
    op.add_column(
        "app_settings",
        sa.Column(
            "stamp_card_type_id",
            sa.String(64),
            sa.ForeignKey("stamp_card_types.id", name="fk_settings_stamp_card_type", ondelete="RESTRICT"),
        ),
    )


def downgrade():
    op.drop_constraint("fk_settings_stamp_card_type", "app_settings", type_="foreignkey")
    op.drop_column("app_settings", "stamp_card_type_id")
    for table in ("stamp_card_rewards", "stamps", "stamp_cards", "stamp_card_types"):
        op.drop_table(table)
