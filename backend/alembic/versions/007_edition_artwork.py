"""Add optional admin-uploaded artwork to editions (#1224).

Three nullable paths per edition: the flyer, the hero photo and the sharing
image. They hold managed ``/uploads/editions/...`` paths written by
``app.services.edition_artwork``; ``NULL`` means "use the static site image",
so existing editions behave exactly as before.

Revision ID: 007
Revises: 006
"""

import sqlalchemy as sa

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None

SLOTS = ("flyer_image", "hero_image", "share_image")


def upgrade() -> None:
    for column in SLOTS:
        op.add_column("editions", sa.Column(column, sa.String(255), nullable=True))


def downgrade() -> None:
    for column in reversed(SLOTS):
        op.drop_column("editions", column)
