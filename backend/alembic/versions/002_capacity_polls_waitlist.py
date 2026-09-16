"""Drop the redundant events.max_capacity headcount cap in favour of the required product's own stock as the sole capacity signal, admin-configured per-edition volunteer meal/dinner poll options with each volunteer's own picks, a per-product visitor waitlist, a rough per-period volunteer schedule/notepad, and a per-edition admin scratchpad.

None of this had shipped in a release as of when it was squashed into one
revision (formerly split across 002/003/004) — 000 and 001 are the only
migrations a deployed database has ever run.

Revision ID: 002
Revises: 001
"""

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Redundant with the required product's own `stock` on every event that
    # actually gates entry (see app/models.py:Event) — an event either has
    # open access or sells a required product, so a separate headcount cap
    # never had an independent use case.
    op.drop_column("events", "max_capacity")

    # Volunteer meal/dinner poll: admin-configured per-edition options
    # (dish/soup/dinner) and each volunteer's own picks.
    op.create_table(
        "edition_poll_options",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind IN ('dish', 'soup', 'dinner')", name="ck_poll_option_kind"),
    )
    op.create_index("ix_edition_poll_options_edition_id", "edition_poll_options", ["edition_id"])
    op.create_table(
        "volunteer_poll_selections",
        sa.Column("volunteer_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "option_id", sa.String(64), sa.ForeignKey("edition_poll_options.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # A visitor's request to be contacted if a sold-out product frees up.
    # Scoped to the product (not the event) since capacity now lives
    # entirely on Product.stock.
    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("product_id", sa.String(64), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("guest_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("client_ip", sa.String(45), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_waitlist_entries_product_id", "waitlist_entries", ["product_id"])
    op.create_index("ix_waitlist_entries_created_at", "waitlist_entries", ["created_at"])

    # A rough, deliberately unstructured per-period schedule/notepad
    # (e.g. "Fri: bar, Sat: serving"), admin-only — not a role/task model.
    op.add_column("volunteer_periods", sa.Column("notes", sa.Text(), nullable=False, server_default=""))

    # A free-text planning notepad scoped to one edition, not a single
    # global blob that would accumulate clutter across editions.
    op.add_column("editions", sa.Column("scratchpad", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("editions", "scratchpad")
    op.drop_column("volunteer_periods", "notes")
    op.drop_index("ix_waitlist_entries_created_at", table_name="waitlist_entries")
    op.drop_index("ix_waitlist_entries_product_id", table_name="waitlist_entries")
    op.drop_table("waitlist_entries")
    op.drop_table("volunteer_poll_selections")
    op.drop_index("ix_edition_poll_options_edition_id", table_name="edition_poll_options")
    op.drop_table("edition_poll_options")
    op.add_column("events", sa.Column("max_capacity", sa.Integer(), nullable=True))
