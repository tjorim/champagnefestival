"""Allow one user to hold both an OIDC subject and a verified email (#1209).

Revision ID: 005
Revises: 004
"""

import sqlalchemy as sa

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_users_exactly_one_identity", "users", type_="check")
    op.create_check_constraint(
        "ck_users_has_identity",
        "users",
        "oidc_subject IS NOT NULL OR verified_email IS NOT NULL",
    )


def downgrade() -> None:
    # A linked account keeps its OIDC subject (bookings, roles and audit
    # provenance follow it) and loses only the email link; the address can
    # sign in by emailed link again as a fresh email-only account.
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE users SET verified_email = NULL WHERE oidc_subject IS NOT NULL"))
    op.drop_constraint("ck_users_has_identity", "users", type_="check")
    op.create_check_constraint(
        "ck_users_exactly_one_identity",
        "users",
        "(oidc_subject IS NOT NULL) != (verified_email IS NOT NULL)",
    )
