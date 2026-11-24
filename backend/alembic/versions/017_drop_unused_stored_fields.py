"""Drop stored fields no screen, client or documented feature uses (#1656).

* ``people.visits_per_month``: accepted and stored through REST and MCP but never shown or edited by the
  dashboard and never read by any rule, export or client.
* ``push_subscriptions.categories`` and ``push_subscriptions.event_ids``: opt-in targeting that was never
  implemented. The public UI always sent the placeholder category ``system_test`` and no events, and the composer
  and the test send both target every subscriber.
* ``edition_poll_options.edition_id``: a stored copy of the edition of the option's question
  (``question_id`` -> ``edition_poll_questions.edition_id``). Nothing constrained the copy to agree with the
  question, so the question is now the only source and the API derives the edition from it.

Dropping a column cannot fail on an odd legacy value, so the upgrade needs no data repair. It does discard the
dropped values: ``visits_per_month`` is not recoverable without the pre-upgrade backup, and nothing ever read the
push targeting columns beyond echoing them back to the subscriber.

Downgrade re-adds the columns: ``visits_per_month`` as ``NULL``, the push columns as empty lists, and the poll
option edition rebuilt from its question.
"""

import sqlalchemy as sa

from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("people", "visits_per_month")
    op.drop_column("push_subscriptions", "categories")
    op.drop_column("push_subscriptions", "event_ids")
    # Dropping the column also drops its foreign key and `ix_edition_poll_options_edition_id`.
    op.drop_column("edition_poll_options", "edition_id")


def downgrade() -> None:
    op.add_column("people", sa.Column("visits_per_month", sa.Integer(), nullable=True))
    for column in ("categories", "event_ids"):
        op.add_column(
            "push_subscriptions",
            sa.Column(column, sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        )
    op.add_column("edition_poll_options", sa.Column("edition_id", sa.String(100), nullable=True))
    op.execute(
        "UPDATE edition_poll_options AS option SET edition_id = question.edition_id "
        "FROM edition_poll_questions AS question WHERE question.id = option.question_id"
    )
    op.alter_column("edition_poll_options", "edition_id", nullable=False)
    op.create_foreign_key(
        "edition_poll_options_edition_id_fkey",
        "edition_poll_options",
        "editions",
        ["edition_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_edition_poll_options_edition_id", "edition_poll_options", ["edition_id"])
