"""Membership, stamp cards, volunteer events and member mailings (folded from 010-014).

These changes shipped as five consecutive revisions during development and were folded into one
before any release, so a database goes from 009 straight to this revision:

- members-only events, member overview settings and unique current-member emails (#1403, #1404)
- capsule-exchange stamp cards and rewards (#1405)
- volunteer-only events with attendance-poll registrations (#1359)
- email categories and per-category consent, replacing ``people.marketing_opt_in`` (#1408)
- the composer email channel and the address suppression list (#1407)

Revision ID: 010
Revises: 009
"""

from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def _upgrade_member_overview() -> None:
    op.add_column("events", sa.Column("members_only", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("app_settings", sa.Column("member_limit", sa.Integer(), nullable=True))
    op.add_column("app_settings", sa.Column("member_inactivity_months", sa.Integer(), nullable=True))
    op.add_column("people", sa.Column("inactivity_exempt", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("people", sa.Column("inactivity_exempt_note", sa.Text(), server_default="", nullable=False))
    predicate = "NOT anonymised AND CAST(roles AS text) LIKE '%\"member\"%' AND retired_roles ->> 'member' IS NULL AND trim(email) <> ''"
    op.create_index(
        "uq_people_current_member_email",
        "people",
        [sa.text("lower(trim(email))")],
        unique=True,
        postgresql_where=sa.text(predicate),
    )
    op.create_index("ix_registrations_person_checked_event", "registrations", ["person_id", "checked_in", "event_id"])


def _downgrade_member_overview() -> None:
    op.drop_column("events", "members_only")
    op.drop_index("ix_registrations_person_checked_event", table_name="registrations")
    op.drop_index("uq_people_current_member_email", table_name="people")
    op.drop_column("people", "inactivity_exempt_note")
    op.drop_column("people", "inactivity_exempt")
    op.drop_column("app_settings", "member_inactivity_months")
    op.drop_column("app_settings", "member_limit")


def _labels():
    return [
        sa.Column("reward_label_nl", sa.String(200), nullable=False),
        sa.Column("reward_label_fr", sa.String(200)),
        sa.Column("reward_label_en", sa.String(200)),
    ]


def _upgrade_stamp_cards() -> None:
    op.create_table(
        "stamp_card_types",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name_nl", sa.String(200), nullable=False),
        sa.Column("name_fr", sa.String(200)),
        sa.Column("name_en", sa.String(200)),
        sa.Column("box_count", sa.Integer(), nullable=False),
        *_labels(),
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
        *_labels(),
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
        *_labels(),
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


def _downgrade_stamp_cards() -> None:
    op.drop_constraint("fk_settings_stamp_card_type", "app_settings", type_="foreignkey")
    op.drop_column("app_settings", "stamp_card_type_id")
    for table in ("stamp_card_rewards", "stamps", "stamp_cards", "stamp_card_types"):
        op.drop_table(table)


def _upgrade_volunteer_poll_events() -> None:
    op.add_column("events", sa.Column("volunteers_only", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column(
        "edition_poll_questions",
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", name="fk_poll_event", ondelete="RESTRICT")),
    )
    op.create_unique_constraint("uq_poll_event", "edition_poll_questions", ["event_id"])
    op.create_check_constraint(
        "ck_poll_event_attendance", "edition_poll_questions", "event_id IS NULL OR kind = 'yes_no'"
    )
    op.add_column(
        "registrations",
        sa.Column(
            "poll_question_id",
            sa.String(64),
            sa.ForeignKey("edition_poll_questions.id", name="fk_registration_poll", ondelete="SET NULL"),
        ),
    )
    op.create_index("ix_registrations_poll_question_id", "registrations", ["poll_question_id"])
    op.create_unique_constraint("uq_registration_poll_person", "registrations", ["poll_question_id", "person_id"])


def _downgrade_volunteer_poll_events() -> None:
    op.drop_constraint("uq_registration_poll_person", "registrations", type_="unique")
    op.drop_constraint("fk_registration_poll", "registrations", type_="foreignkey")
    op.drop_index("ix_registrations_poll_question_id", table_name="registrations")
    op.drop_column("registrations", "poll_question_id")
    op.drop_constraint("ck_poll_event_attendance", "edition_poll_questions", type_="check")
    op.drop_constraint("uq_poll_event", "edition_poll_questions", type_="unique")
    op.drop_constraint("fk_poll_event", "edition_poll_questions", type_="foreignkey")
    op.drop_column("edition_poll_questions", "event_id")
    op.drop_column("events", "volunteers_only")


# Keep in step with app.services.email_categories.DEFAULT_EMAIL_CATEGORIES (a migration must not
# import application code, which keeps changing after it ran).
DEFAULTS = [
    {
        "key": "club_news",
        "name_nl": "Clubnieuws",
        "name_fr": "Actualités du club",
        "name_en": "Club news",
        "description_nl": "Nieuws en uitnodigingen voor leden van Champagnelovers, zoals de maandelijkse capsule-ruilbeurs.",
        "description_fr": "Actualités et invitations pour les membres de Champagnelovers, comme l’échange mensuel de capsules.",
        "description_en": "News and invitations for Champagnelovers members, such as the monthly capsule exchange.",
        "allowed_roles": ["member"],
        "automatic": False,
        "sort_order": 10,
    },
    {
        "key": "new_editions",
        "name_nl": "Nieuwe festivaleditie",
        "name_fr": "Nouvelle édition du festival",
        "name_en": "New festival editions",
        "description_nl": "Een bericht wanneer de inschrijvingen voor een nieuwe editie van het Champagnefestival openen.",
        "description_fr": "Un message lorsque les inscriptions pour une nouvelle édition du Champagnefestival ouvrent.",
        "description_en": "A message when registrations open for a new edition of the Champagne Festival.",
        "allowed_roles": [],
        "automatic": False,
        "sort_order": 20,
    },
    {
        "key": "volunteer_news",
        "name_nl": "Nieuws voor vrijwilligers",
        "name_fr": "Actualités pour les bénévoles",
        "name_en": "Volunteer news",
        "description_nl": "Praktische informatie en oproepen voor de vrijwilligers van het festival.",
        "description_fr": "Informations pratiques et appels pour les bénévoles du festival.",
        "description_en": "Practical information and calls for the festival’s volunteers.",
        "allowed_roles": ["volunteer"],
        "automatic": False,
        "sort_order": 30,
    },
    {
        "key": "reward_ready",
        "name_nl": "Beloning klaar",
        "name_fr": "Récompense prête",
        "name_en": "Reward ready",
        "description_nl": "Een bericht zodra een beloning van je stempelkaart klaarligt.",
        "description_fr": "Un message dès qu’une récompense de votre carte de fidélité est prête.",
        "description_en": "A message as soon as a reward from your stamp card is ready.",
        "allowed_roles": ["member"],
        "automatic": True,
        "sort_order": 40,
    },
]


def _upgrade_email_categories_and_consent() -> None:
    categories = op.create_table(
        "email_categories",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("name_nl", sa.String(100), nullable=False),
        sa.Column("name_fr", sa.String(100)),
        sa.Column("name_en", sa.String(100)),
        sa.Column("description_nl", sa.String(500)),
        sa.Column("description_fr", sa.String(500)),
        sa.Column("description_en", sa.String(500)),
        sa.Column("allowed_roles", sa.JSON(), nullable=False),
        sa.Column("automatic", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("(length(trim(name_nl)) > 0) IS TRUE", name="ck_email_categories_name_nl"),
        sa.CheckConstraint(
            "((description_fr IS NULL AND description_en IS NULL) OR length(trim(description_nl)) > 0) IS TRUE",
            name="ck_email_categories_description_nl",
        ),
    )
    now = datetime.now(UTC)
    op.bulk_insert(categories, [{**row, "created_at": now, "updated_at": now} for row in DEFAULTS])

    op.create_table(
        "email_consents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "category_key", sa.String(50), sa.ForeignKey("email_categories.key", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_source", sa.String(30)),
        sa.CheckConstraint("(revoked_at IS NULL) = (revoked_source IS NULL)", name="ck_email_consents_revocation"),
    )
    op.create_index("ix_email_consents_person_id", "email_consents", ["person_id"])
    op.create_index("ix_email_consents_category_key", "email_consents", ["category_key"])
    op.create_index(
        "uq_email_consents_open",
        "email_consents",
        ["person_id", "category_key"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    op.create_table(
        "email_consent_confirmations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("person_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "category_key", sa.String(50), sa.ForeignKey("email_categories.key", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("person_id", "category_key", name="uq_email_consent_confirmation"),
    )
    op.create_index("ix_email_consent_confirmations_person_id", "email_consent_confirmations", ["person_id"])

    op.drop_column("people", "marketing_opt_in_at")
    op.drop_column("people", "marketing_opt_in")


def _downgrade_email_categories_and_consent() -> None:
    op.add_column("people", sa.Column("marketing_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("people", sa.Column("marketing_opt_in_at", sa.DateTime(timezone=True)))
    op.drop_table("email_consent_confirmations")
    op.drop_table("email_consents")
    op.drop_table("email_categories")


def _upgrade_member_mailings() -> None:
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


def _downgrade_member_mailings() -> None:
    op.drop_table("email_suppressions")
    op.drop_column("composed_messages", "email_audience_snapshot")
    op.drop_constraint("fk_composed_messages_email_category", "composed_messages", type_="foreignkey")
    op.drop_column("composed_messages", "email_category_key")


def upgrade() -> None:
    _upgrade_member_overview()
    _upgrade_stamp_cards()
    _upgrade_volunteer_poll_events()
    _upgrade_email_categories_and_consent()
    _upgrade_member_mailings()


def downgrade() -> None:
    _downgrade_member_mailings()
    _downgrade_email_categories_and_consent()
    _downgrade_volunteer_poll_events()
    _downgrade_stamp_cards()
    _downgrade_member_overview()
