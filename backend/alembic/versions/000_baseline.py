"""Create the complete schema baseline.

Revision ID: 000
Revises: None
"""

from __future__ import annotations

from collections import defaultdict

import sqlalchemy as sa

from alembic import op

revision: str = "000"
down_revision: str | None = None
branch_labels = None
depends_on = None


_OPERATIONAL_SEARCH_STATEMENTS = (
    "CREATE EXTENSION IF NOT EXISTS unaccent",
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE EXTENSION IF NOT EXISTS fuzzystrmatch",
    """
    CREATE OR REPLACE FUNCTION update_person_operational_search_values() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
        NEW.search_name := trim(regexp_replace(lower(unaccent(NEW.name)), '[^[:alnum:]]+', ' ', 'g'));
        NEW.search_name_alt := trim(regexp_replace(lower(unaccent(
            replace(replace(replace(replace(lower(NEW.name), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')
        )), '[^[:alnum:]]+', ' ', 'g'));
        NEW.search_email := lower(NEW.email);
        RETURN NEW;
    END;
    $$;
    """,
    "DROP TRIGGER IF EXISTS people_operational_search_values ON people",
    """
    CREATE TRIGGER people_operational_search_values
    BEFORE INSERT OR UPDATE OF name, email ON people
    FOR EACH ROW EXECUTE FUNCTION update_person_operational_search_values()
    """,
    "CREATE INDEX IF NOT EXISTS ix_people_search_name_trgm ON people USING gin (search_name gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_name_alt_trgm ON people USING gin (search_name_alt gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_email ON people (search_email)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_email_trgm ON people USING gin (search_email gin_trgm_ops)",
)

_RANKED_ACTIVE_EDITIONS = """
    SELECT id, edition_type,
           row_number() OVER (
               PARTITION BY edition_type ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM editions
    WHERE active = true
"""

_LEGACY_DEFAULT_ROOMS = "SELECT id, width_m, length_m FROM rooms WHERE width_m = 20.0 AND length_m = 15.0"

_EARLIEST_VENUE = "SELECT id FROM venues ORDER BY created_at, id LIMIT 1"

_COLUMNS = ("national_register_number", "eid_document_number")


def _normalise(value: str) -> str:
    for ch in (" ", ".", "-", "/"):
        value = value.replace(ch, "")
    value = value.strip().lower()
    return value


def upgrade() -> None:
    # Legacy revision 001.
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("oidc_subject", sa.String(255), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_oidc_subject", "users", ["oidc_subject"], unique=True)

    op.create_table(
        "people",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=False, server_default=""),
        sa.Column("phone", sa.String(50), nullable=False, server_default=""),
        sa.Column("address", sa.String(300), nullable=False, server_default=""),
        sa.Column("roles", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("national_register_number", sa.String(20), unique=True, nullable=True),
        sa.Column("eid_document_number", sa.String(50), unique=True, nullable=True),
        sa.Column("visits_per_month", sa.Integer(), nullable=True),
        sa.Column("club_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("search_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("search_name_alt", sa.String(200), nullable=False, server_default=""),
        sa.Column("search_email", sa.String(200), nullable=False, server_default=""),
    )

    op.create_table(
        "venues",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.String(200), nullable=False, server_default=""),
        sa.Column("city", sa.String(100), nullable=False, server_default=""),
        sa.Column("postal_code", sa.String(20), nullable=False, server_default=""),
        sa.Column("country", sa.String(100), nullable=False, server_default=""),
        sa.Column("lat", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("lng", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "exhibitors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("image", sa.String(500), nullable=False, server_default=""),
        sa.Column("website", sa.String(500), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("type", sa.String(20), nullable=False, server_default="vendor"),
        sa.Column("contact_person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "editions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(20), nullable=False),
        sa.Column("venue_id", sa.String(64), sa.ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("edition_type", sa.String(20), nullable=False, server_default="festival"),
        sa.Column("external_partner", sa.String(200), nullable=True),
        sa.Column("external_contact_name", sa.String(200), nullable=True),
        sa.Column("external_contact_email", sa.String(200), nullable=True),
        sa.Column("exhibitors", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.String(10), nullable=False),
        sa.Column("end_time", sa.String(10), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("registration_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("registrations_open_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_capacity", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_events_edition_id", "events", ["edition_id"])
    op.create_index("ix_events_date", "events", ["date"])
    op.create_index("ix_events_active", "events", ["active"])

    op.create_table(
        "rooms",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("venue_id", sa.String(64), sa.ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("width_m", sa.Float(), nullable=False, server_default="20.0"),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="15.0"),
        sa.Column("color", sa.String(20), nullable=False, server_default="#6c757d"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "table_types",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("shape", sa.String(20), nullable=False, server_default="rectangle"),
        sa.Column("width_m", sa.Float(), nullable=False, server_default="0.7"),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="1.8"),
        sa.Column("height_type", sa.String(20), nullable=False, server_default="low"),
        sa.Column("max_capacity", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "layouts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("room_id", sa.String(64), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "tables",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("y", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("table_type_id", sa.String(64), sa.ForeignKey("table_types.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("rotation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("layout_id", sa.String(64), sa.ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reservation_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "registrations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("guest_count", sa.Integer(), nullable=False),
        sa.Column("pre_orders", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("accessibility_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("table_id", sa.String(64), sa.ForeignKey("tables.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("payment_status", sa.String(20), nullable=False, server_default="unpaid"),
        sa.Column("checked_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("strap_issued", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("check_in_token", sa.String(64), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_registrations_person_id", "registrations", ["person_id"])
    op.create_index("ix_registrations_event_id", "registrations", ["event_id"])
    op.create_index("ix_registrations_status", "registrations", ["status"])
    op.create_index("ix_registrations_table_id", "registrations", ["table_id"])
    op.create_index("ix_registrations_user_id", "registrations", ["user_id"])

    op.create_table(
        "reservation_access_tokens",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(200), unique=True, nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "areas",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("layout_id", sa.String(64), sa.ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exhibitor_id", sa.Integer(), sa.ForeignKey("exhibitors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("icon", sa.String(50), nullable=False, server_default="bi-shop"),
        sa.Column("x", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("y", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("rotation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width_m", sa.Float(), nullable=False, server_default="1.5"),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "volunteer_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("volunteer_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_help_day", sa.Date(), nullable=False),
        sa.Column("last_help_day", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "audit_entries",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(64), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("details", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
    )
    op.create_index("ix_audit_entries_timestamp", "audit_entries", ["timestamp"])
    op.create_index("ix_audit_entries_actor", "audit_entries", ["actor"])
    op.create_index("ix_audit_entries_action", "audit_entries", ["action"])
    op.create_index("ix_audit_entries_resource_type", "audit_entries", ["resource_type"])
    op.create_index("ix_audit_entries_resource_id", "audit_entries", ["resource_id"])

    for statement in _OPERATIONAL_SEARCH_STATEMENTS:
        op.execute(statement)
    # Legacy revision 002.
    op.create_table(
        "pebble_access_tokens",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_pebble_access_tokens_token_hash",
        "pebble_access_tokens",
        ["token_hash"],
        unique=True,
    )
    # Legacy revision 003.
    # --- Bourse table fees, settled offline -----------------------------------
    op.add_column("registrations", sa.Column("amount_due", sa.Numeric(10, 2), nullable=True))

    # --- Edition co-organizer, replacing the unused external-partner fields ---
    op.drop_column("editions", "external_contact_email")
    op.drop_column("editions", "external_contact_name")
    op.drop_column("editions", "external_partner")

    op.add_column("editions", sa.Column("co_organizer_exhibitor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_editions_co_organizer_exhibitor_id",
        "editions",
        "exhibitors",
        ["co_organizer_exhibitor_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- Event-scoped products, with required and bundled variants ------------
    op.create_table(
        "products",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("included_product_id", sa.String(64), nullable=True),
        sa.Column("included_per_guests", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["included_product_id"],
            ["products.id"],
            name="fk_products_included_product_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_products_event_id", "products", ["event_id"])
    # Legacy revision 004.
    op.alter_column("registrations", "pre_orders", new_column_name="order_items")
    # Legacy revision 005.
    op.create_table(
        "app_settings",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "faq_items",
        sa.Column("id", sa.String(64), primary_key=True),
        # Dutch is the required, primary-language content; English/French are
        # optional per item — a blank translation hides that item on that
        # locale's public FAQ rather than falling back to Dutch text.
        sa.Column("question_nl", sa.String(500), nullable=False),
        sa.Column("answer_nl", sa.Text(), nullable=False),
        sa.Column("question_en", sa.String(500), nullable=True),
        sa.Column("answer_en", sa.Text(), nullable=True),
        sa.Column("question_fr", sa.String(500), nullable=True),
        sa.Column("answer_fr", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # Legacy revision 006.
    op.create_table(
        "integration_clients",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("key_hash", sa.String(128), nullable=False),
        sa.Column("key_preview", sa.String(8), nullable=False),
        sa.Column("allowed_role", sa.String(20), nullable=False),
        sa.Column("created_by_actor", sa.String(255), nullable=False),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_limit_window_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_limit_window_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_integration_clients_key_hash",
        "integration_clients",
        ["key_hash"],
        unique=True,
    )
    # Legacy revision 007.
    op.add_column(
        "audit_entries",
        sa.Column("auth_source", sa.String(32), nullable=False, server_default="unknown"),
    )
    op.add_column("audit_entries", sa.Column("subject", sa.String(255), nullable=True))
    op.add_column("audit_entries", sa.Column("integration_client_id", sa.String(64), nullable=True))
    op.execute(
        sa.text(
            """UPDATE audit_entries
               SET auth_source = CASE
                       WHEN actor = 'anonymous' THEN 'none'
                       WHEN actor LIKE 'integration:%' THEN 'integration'
                       ELSE 'keycloak'
                   END,
                   subject = CASE WHEN actor = 'anonymous' THEN NULL ELSE actor END,
                   integration_client_id = CASE
                       WHEN actor LIKE 'integration:%' THEN substring(actor FROM 13)
                       ELSE NULL
                   END"""
        )
    )
    op.alter_column("audit_entries", "auth_source", server_default=None)
    op.create_index("ix_audit_entries_auth_source", "audit_entries", ["auth_source"])
    op.create_index("ix_audit_entries_integration_client_id", "audit_entries", ["integration_client_id"])
    # Legacy revision 008.
    op.drop_constraint("users_oidc_subject_key", "users", type_="unique")
    op.drop_constraint("pebble_access_tokens_token_hash_key", "pebble_access_tokens", type_="unique")
    # Legacy revision 009.
    op.execute(
        sa.text(
            f"""
            WITH ranked AS ({_RANKED_ACTIVE_EDITIONS}),
            to_deactivate AS (SELECT id, edition_type FROM ranked WHERE rn > 1)
            INSERT INTO audit_entries (
                id, "timestamp", actor, auth_source, subject, integration_client_id,
                action, resource_type, resource_id, request_id, details
            )
            SELECT
                -- `audit_entries.id` is String(64) while `editions.id` allows up to 100
                -- chars; left() caps the generated id at the column limit instead of
                -- letting a long edition id abort the migration.
                left('aud_mig009_' || id, 64),
                now(),
                'system:migration_009',
                'none',
                NULL,
                NULL,
                'edition_deactivated',
                'edition',
                id,
                NULL,
                jsonb_build_object('reason', 'duplicate_active_repair', 'edition_type', edition_type)
            FROM to_deactivate
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            WITH ranked AS ({_RANKED_ACTIVE_EDITIONS})
            UPDATE editions
            SET active = false, updated_at = now()
            WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )
    op.create_index(
        "uq_editions_active_type",
        "editions",
        ["edition_type"],
        unique=True,
        postgresql_where=sa.text("active = true"),
    )
    # Legacy revision 010.
    op.add_column(
        "rooms",
        sa.Column("dimensions_placeholder", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        sa.text(
            f"""
            WITH legacy AS ({_LEGACY_DEFAULT_ROOMS})
            INSERT INTO audit_entries (
                id, "timestamp", actor, auth_source, subject, integration_client_id,
                action, resource_type, resource_id, request_id, details
            )
            SELECT
                -- `audit_entries.id` is String(64) while `rooms.id` allows up to 64
                -- chars itself; left() caps the generated id at the column limit
                -- instead of letting a long room id abort the migration.
                left('aud_mig010_' || id, 64),
                now(),
                'system:migration_010',
                'none',
                NULL,
                NULL,
                'room_flagged_placeholder_dimensions',
                'room',
                id,
                NULL,
                jsonb_build_object('reason', 'legacy_default_dimensions', 'width_m', width_m, 'length_m', length_m)
            FROM legacy
            """
        )
    )
    op.execute(sa.text("UPDATE rooms SET dimensions_placeholder = true WHERE width_m = 20.0 AND length_m = 15.0"))
    op.alter_column("rooms", "width_m", server_default=None)
    op.alter_column("rooms", "length_m", server_default=None)
    # Legacy revision 011.
    op.add_column("table_types", sa.Column("venue_id", sa.String(64), nullable=True))
    op.execute(
        sa.text(
            f"""
            WITH backfilled AS (
                UPDATE table_types
                SET venue_id = ({_EARLIEST_VENUE})
                WHERE venue_id IS NULL AND EXISTS (SELECT 1 FROM venues)
                RETURNING id, venue_id
            )
            INSERT INTO audit_entries (
                id, "timestamp", actor, auth_source, subject, integration_client_id,
                action, resource_type, resource_id, request_id, details
            )
            SELECT
                -- See migration 010 for why this is capped with left() rather than
                -- concatenated directly: audit_entries.id is String(64), and a
                -- table_type id near that limit would otherwise blow the column.
                left('aud_mig011_' || id, 64),
                now(),
                'system:migration_011',
                'none',
                NULL,
                NULL,
                'table_type_backfilled_venue',
                'table_type',
                id,
                NULL,
                jsonb_build_object('venue_id', venue_id)
            FROM backfilled
            """
        )
    )
    # The backfill above only assigns a venue when at least one exists (see
    # _EARLIEST_VENUE's WHERE clause) — a table_types row predating any venue at
    # all would otherwise hit the NOT NULL constraint below as an opaque Postgres
    # error. Fail loudly and explain the fix instead.
    unassigned = op.get_bind().execute(sa.text("SELECT count(*) FROM table_types WHERE venue_id IS NULL")).scalar()
    if unassigned:
        raise RuntimeError(
            f"Migration 011 cannot proceed: {unassigned} table_types row(s) have no venue "
            "to backfill from (no venues exist). Create at least one venue, or manually "
            "assign table_types.venue_id, then re-run this migration."
        )

    op.alter_column("table_types", "venue_id", nullable=False)
    op.create_foreign_key(
        "table_types_venue_id_fkey",
        "table_types",
        "venues",
        ["venue_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    # Legacy revision 012.
    op.execute(
        """
        UPDATE faq_items
        SET sort_order = ranked.new_order
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1 AS new_order
            FROM faq_items
        ) AS ranked
        WHERE faq_items.id = ranked.id AND faq_items.sort_order != ranked.new_order
        """
    )
    op.create_unique_constraint(
        "uq_faq_items_sort_order",
        "faq_items",
        ["sort_order"],
        deferrable=True,
        initially="DEFERRED",
    )
    # Legacy revision 013.
    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("scope", sa.String(100), nullable=False),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_idempotency_keys_scope_key", "idempotency_keys", ["scope", "key"])
    op.create_index("ix_idempotency_keys_created_at", "idempotency_keys", ["created_at"])
    # Legacy revision 014.
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
    # Legacy revision 014.
    # Renormalisation discards the original separator/casing, so there's no
    # recorded prior value to restore. The renormalised form is still a
    # valid, equivalent identity value, so leaving it in place on downgrade
    # is safe — there is nothing else for this step to reasonably do.
    pass
    # Legacy revision 013.
    op.drop_index("ix_idempotency_keys_created_at", table_name="idempotency_keys")
    op.drop_constraint("uq_idempotency_keys_scope_key", "idempotency_keys", type_="unique")
    op.drop_table("idempotency_keys")
    # Legacy revision 012.
    op.drop_constraint("uq_faq_items_sort_order", "faq_items", type_="unique")
    # Legacy revision 011.
    op.drop_constraint("table_types_venue_id_fkey", "table_types", type_="foreignkey")
    op.drop_column("table_types", "venue_id")
    # Legacy revision 010.
    op.alter_column("rooms", "length_m", server_default="15.0")
    op.alter_column("rooms", "width_m", server_default="20.0")
    op.drop_column("rooms", "dimensions_placeholder")
    # Legacy revision 009.
    op.drop_index("uq_editions_active_type", table_name="editions")
    # Legacy revision 008.
    op.create_unique_constraint("users_oidc_subject_key", "users", ["oidc_subject"])
    op.create_unique_constraint("pebble_access_tokens_token_hash_key", "pebble_access_tokens", ["token_hash"])
    # Legacy revision 007.
    op.drop_index("ix_audit_entries_integration_client_id", table_name="audit_entries")
    op.drop_index("ix_audit_entries_auth_source", table_name="audit_entries")
    op.drop_column("audit_entries", "integration_client_id")
    op.drop_column("audit_entries", "subject")
    op.drop_column("audit_entries", "auth_source")
    # Legacy revision 006.
    op.drop_index("ix_integration_clients_key_hash", table_name="integration_clients")
    op.drop_table("integration_clients")
    # Legacy revision 005.
    op.drop_table("faq_items")
    op.drop_table("app_settings")
    # Legacy revision 004.
    op.alter_column("registrations", "order_items", new_column_name="pre_orders")
    # Legacy revision 003.
    op.drop_index("ix_products_event_id", table_name="products")
    op.drop_table("products")

    op.drop_constraint("fk_editions_co_organizer_exhibitor_id", "editions", type_="foreignkey")
    op.drop_column("editions", "co_organizer_exhibitor_id")

    # Recreates the columns, but not the values they held.
    op.add_column("editions", sa.Column("external_partner", sa.String(200), nullable=True))
    op.add_column("editions", sa.Column("external_contact_name", sa.String(200), nullable=True))
    op.add_column("editions", sa.Column("external_contact_email", sa.String(200), nullable=True))

    op.drop_column("registrations", "amount_due")
    # Legacy revision 002.
    op.drop_index("ix_pebble_access_tokens_token_hash", table_name="pebble_access_tokens")
    op.drop_table("pebble_access_tokens")
    # Legacy revision 001.
    op.execute("DROP INDEX IF EXISTS ix_people_search_email_trgm")
    op.execute("DROP INDEX IF EXISTS ix_people_search_email")
    op.execute("DROP INDEX IF EXISTS ix_people_search_name_alt_trgm")
    op.execute("DROP INDEX IF EXISTS ix_people_search_name_trgm")
    op.execute("DROP TRIGGER IF EXISTS people_operational_search_values ON people")
    op.execute("DROP FUNCTION IF EXISTS update_person_operational_search_values()")
    op.drop_table("audit_entries")
    op.drop_table("volunteer_periods")
    op.drop_table("areas")
    op.drop_table("reservation_access_tokens")
    op.drop_table("registrations")
    op.drop_table("tables")
    op.drop_table("layouts")
    op.drop_table("table_types")
    op.drop_table("rooms")
    op.drop_table("events")
    op.drop_table("editions")
    op.drop_table("exhibitors")
    op.drop_table("venues")
    op.drop_table("people")
    op.drop_table("users")
