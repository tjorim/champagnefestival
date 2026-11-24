"""Link people to user accounts by key (#1655).

``people.user_id`` (nullable, unique, ``ON DELETE SET NULL``) replaces ``people.oidc_subject``: the account that
owns a person is found through the key, not by comparing a subject or email string each time.

The upgrade backfills the link in two passes. Both are written so that odd, duplicate or ambiguous legacy values
leave the link empty instead of failing the migration or guessing:

1. **Subject link** (``people.oidc_subject`` is unique, set by the volunteer's own token or by an admin). Each
   non-blank subject is mapped to the ``users`` row that holds it; a subject that never signed in gets a new
   account row so the link is not lost (it is the same subject the person already answered to, so nothing new
   is granted). Blank or whitespace-only subjects are ignored.
2. **Verified-email link**, mirroring ``app.services.person_account.link_by_verified_email``. An account that still
   has no person is linked to a person only when *all* of these hold, otherwise the link stays empty:

   * the account's verified email (trimmed, lower-cased) is held by exactly one non-anonymised person, so a shared
     inbox or an unmerged duplicate is never guessed;
   * no other account has the same normalised verified email (``users.verified_email`` is unique as stored, not
     as normalised);
   * that person is not linked yet, has no national register number or eID document number, and does not hold
     the volunteer role — identity-document holders are linked only by the volunteer themselves or an admin.

   An unverified or free-text address is never used: ``people.email`` is typed by whoever made the booking, and
   only the *account's* address is verified.

Downgrade restores ``people.oidc_subject`` from the linked account's subject and drops ``user_id``. It is lossy in
two ways: a person linked to an email-only account (no subject) loses that link, and the account rows created for
subjects in step 1 are kept (an account row without bookings is harmless).
"""

import sqlalchemy as sa

from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None

_LINK_BY_SUBJECT = """
INSERT INTO users (id, oidc_subject, created_at, updated_at)
SELECT 'usr_' || md5(subject), subject, now(), now()
FROM (SELECT DISTINCT oidc_subject AS subject FROM people WHERE trim(oidc_subject) <> '') AS subjects
WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.oidc_subject = subjects.subject)
ON CONFLICT DO NOTHING
"""

_ASSIGN_BY_SUBJECT = """
UPDATE people SET user_id = users.id
FROM users
WHERE users.oidc_subject = people.oidc_subject AND trim(people.oidc_subject) <> ''
"""

_LINK_BY_VERIFIED_EMAIL = """
WITH holders AS (
    SELECT lower(trim(email)) AS email, count(*) AS holders, min(id) AS person_id
    FROM people
    WHERE NOT anonymised AND trim(email) <> ''
    GROUP BY lower(trim(email))
), accounts AS (
    SELECT lower(trim(verified_email)) AS email, count(*) AS accounts, min(id) AS user_id
    FROM users
    WHERE verified_email IS NOT NULL AND trim(verified_email) <> ''
    GROUP BY lower(trim(verified_email))
)
UPDATE people SET user_id = accounts.user_id
FROM holders
JOIN accounts ON accounts.email = holders.email
WHERE people.id = holders.person_id
  AND holders.holders = 1
  AND accounts.accounts = 1
  AND people.user_id IS NULL
  AND coalesce(people.national_register_number, '') = ''
  AND coalesce(people.eid_document_number, '') = ''
  AND NOT EXISTS (
      SELECT 1 FROM person_role_periods
      WHERE person_role_periods.person_id = people.id AND person_role_periods.role = 'volunteer'
        AND NOT person_role_periods.removed
  )
  AND NOT EXISTS (SELECT 1 FROM people linked WHERE linked.user_id = accounts.user_id)
"""


def upgrade() -> None:
    op.add_column("people", sa.Column("user_id", sa.String(64), nullable=True))
    op.create_foreign_key("people_user_id_fkey", "people", "users", ["user_id"], ["id"], ondelete="SET NULL")
    op.create_unique_constraint("people_user_id_key", "people", ["user_id"])
    op.execute(_LINK_BY_SUBJECT)
    op.execute(_ASSIGN_BY_SUBJECT)
    op.execute(_LINK_BY_VERIFIED_EMAIL)
    op.drop_column("people", "oidc_subject")


def downgrade() -> None:
    op.add_column("people", sa.Column("oidc_subject", sa.String(255), nullable=True))
    op.execute(
        "UPDATE people SET oidc_subject = users.oidc_subject "
        "FROM users WHERE users.id = people.user_id AND users.oidc_subject IS NOT NULL"
    )
    op.create_unique_constraint("uq_people_oidc_subject", "people", ["oidc_subject"])
    op.drop_column("people", "user_id")
