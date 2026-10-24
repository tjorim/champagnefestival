"""Email categories and per-category consent (#1408).

Replaces the single ``people.marketing_opt_in`` flag. Nobody is registered yet, so no existing
consent is migrated: everyone starts unsubscribed.

Revision ID: 013
Revises: 012
"""

from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

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


def upgrade():
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


def downgrade():
    op.add_column("people", sa.Column("marketing_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("people", sa.Column("marketing_opt_in_at", sa.DateTime(timezone=True)))
    op.drop_table("email_consent_confirmations")
    op.drop_table("email_consents")
    op.drop_table("email_categories")
