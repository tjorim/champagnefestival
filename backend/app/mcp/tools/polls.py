"""Admin tools for volunteer polls: questions, options and per-volunteer orders.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from datetime import datetime

from app.core.translations import Language
from app.mcp.admin import poll as mcp_admin_poll
from app.mcp.tools.base import McpBackendBase
from app.schemas import (
    DietaryTag,
    PollAttendanceItem,
    PollChoiceItem,
    PollQuestionKind,
    PollRatingItem,
    PollSelectionItem,
    PollTextItem,
)


class PollsTools(McpBackendBase):
    """Admin tools for volunteer polls: questions, options and per-volunteer orders."""

    async def list_poll_questions(self, edition_id: str, locale: Language | None = None) -> list[dict]:
        """List the volunteer poll questions of an edition in display order. A question is ``yes_no`` (will
        you join this, with how many people) or ``meals`` (pick dishes, a quantity each; its ``options`` are
        included with what volunteers asked for in total). Each has its own closing time (``closes_at``,
        ``closed``) and counts of who answered. ``title`` is resolved for ``locale`` (Dutch when omitted).
        Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.list_poll_questions(self.session_factory, edition_id, locale)

    async def create_poll_question(
        self,
        edition_id: str,
        kind: PollQuestionKind,
        title_nl: str | None = None,
        title_fr: str | None = None,
        title_en: str | None = None,
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        event_id: str | None = None,
        closes_at: datetime | None = None,
    ) -> dict:
        """Add a question to an edition's volunteer poll, after the existing ones. ``kind`` supports
        ``single_choice`` (one configured option), ``free_text`` (up to 500 characters),
        ``rating`` (integer 1–5), ``yes_no`` (for
        example "Will you join the dinner on Sunday?"; volunteers answer yes with a number of people, or no) or
        ``meals`` (add options afterwards with ``create_poll_option``). The Dutch title is required; French and
        English are optional translations. ``closes_at`` (with a timezone) is when volunteers can no longer
        change their answer. An optional ``event_id`` links an attendance question to a volunteer-only event; yes answers create registrations. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.create_poll_question(
            self.session_factory,
            self._actor(),
            edition_id=edition_id,
            event_id=event_id,
            kind=kind,
            title_nl=title_nl,
            title_fr=title_fr,
            title_en=title_en,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            closes_at=closes_at,
        )

    async def update_poll_question(
        self,
        question_id: str,
        title_nl: str | None = None,
        title_fr: str | None = None,
        title_en: str | None = None,
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        event_id: str | None = None,
        closes_at: datetime | None = None,
        clear_event: bool = False,
        reopen: bool = False,
    ) -> dict:
        """Partially update a poll question; omitted fields are left unchanged and an empty string clears a
        translation (the Dutch title cannot be cleared). ``closes_at`` sets when volunteers can no longer change
        their answer (a past time closes the question now); ``reopen=true`` clears it. The kind cannot change.
        An optional ``event_id`` links an attendance question to a volunteer-only event; yes answers create registrations. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.update_poll_question(
            self.session_factory,
            self._actor(),
            question_id,
            title_nl=title_nl,
            title_fr=title_fr,
            title_en=title_en,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            closes_at=closes_at,
            event_id=event_id,
            clear_event=clear_event,
            reopen=reopen,
        )

    async def delete_poll_question(self, question_id: str, confirm_answers: bool = False, notify: bool = True) -> dict:
        """Delete a poll question with its options and answers. When volunteers answered it, nothing is deleted
        unless ``confirm_answers`` is true; ``notify`` emails affected volunteers by default.
        A closed question refuses the deletion (reopen it first). Requires
        the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.delete_poll_question(
            self.session_factory, self._actor(), question_id, confirm_answers=confirm_answers, notify=notify
        )

    async def reorder_poll_questions(self, edition_id: str, ordered_ids: list[str]) -> dict:
        """Set the display order of an edition's poll questions; ``ordered_ids`` must name every question of the
        edition exactly once. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.reorder_poll_questions(
            self.session_factory, self._actor(), edition_id=edition_id, ordered_ids=ordered_ids
        )

    async def copy_poll_questions(self, from_edition_id: str, to_edition_id: str) -> dict:
        """Copy the poll questions of one edition to another with their meal options (never answers or closing
        times), after the ones already there. A question whose kind and Dutch title exist in the target is
        skipped, so repeating the copy adds nothing. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.copy_poll_questions(
            self.session_factory, self._actor(), from_edition_id=from_edition_id, to_edition_id=to_edition_id
        )

    async def create_poll_option(
        self,
        question_id: str,
        label_nl: str | None = None,
        label_fr: str | None = None,
        label_en: str | None = None,
        dietary_tags: list[DietaryTag] | None = None,
    ) -> dict:
        """Add one meal choice (a dish, a soup, ...) to a ``meals`` poll question, after the existing ones.
        Volunteers pick a quantity of each. The Dutch label is required; French and English are optional
        translations. ``dietary_tags`` flags what the meal suits or contains. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.create_poll_option(
            self.session_factory,
            self._actor(),
            question_id=question_id,
            label_nl=label_nl,
            label_fr=label_fr,
            label_en=label_en,
            dietary_tags=dietary_tags,
        )

    async def list_poll_options(
        self, question_id: str | None = None, edition_id: str | None = None, locale: Language | None = None
    ) -> list[dict]:
        """List meal poll options in display order, optionally filtered by question or edition, with the total
        quantity volunteers asked for and how many volunteers picked each (what to order from the caterer).
        ``label`` is resolved for ``locale`` (Dutch when omitted). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.list_poll_options(self.session_factory, question_id, edition_id, locale)

    async def update_poll_option(
        self,
        option_id: str,
        label_nl: str | None = None,
        label_fr: str | None = None,
        label_en: str | None = None,
        dietary_tags: list[DietaryTag] | None = None,
    ) -> dict:
        """Partially update a meal poll option; omitted fields are left unchanged and volunteers keep
        their quantities. An empty string clears a translation (the Dutch label cannot be cleared);
        ``dietary_tags`` replaces the whole list. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.update_poll_option(
            self.session_factory,
            self._actor(),
            option_id,
            label_nl=label_nl,
            label_fr=label_fr,
            label_en=label_en,
            dietary_tags=dietary_tags,
        )

    async def delete_poll_option(self, option_id: str, confirm_selections: bool = False, notify: bool = True) -> dict:
        """Delete a meal poll option. When volunteers already picked it, nothing is deleted unless
        ``confirm_selections`` is true, which removes their picks. ``notify`` emails affected volunteers
        by default; a closed question refuses the deletion
        (reopen it first). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.delete_poll_option(
            self.session_factory, self._actor(), option_id, confirm_selections=confirm_selections, notify=notify
        )

    async def reorder_poll_options(self, question_id: str, ordered_ids: list[str]) -> dict:
        """Set the display order of a question's options; ``ordered_ids`` must name every option of the
        question exactly once. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.reorder_poll_options(
            self.session_factory, self._actor(), question_id=question_id, ordered_ids=ordered_ids
        )

    async def list_poll_orders(self, edition_id: str, locale: Language | None = None) -> dict:
        """Who answered what in an edition's volunteer poll: every active volunteer (also those who have not
        answered yet) with their meal picks, yes/no answers (with number of people), choices, text, ratings
        and dietary note, next to
        the questions in display order with counts. Contains volunteer names. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.list_poll_orders(self.session_factory, edition_id, locale)

    async def set_volunteer_poll_order(
        self,
        edition_id: str,
        volunteer_id: str,
        selections: list[PollSelectionItem] | None = None,
        attendance: list[PollAttendanceItem] | None = None,
        choices: list[PollChoiceItem] | None = None,
        texts: list[PollTextItem] | None = None,
        ratings: list[PollRatingItem] | None = None,
        note: str | None = None,
        confirm_closed: bool = False,
    ) -> dict:
        """Enter or correct a volunteer's answers (for example from an email they sent): ``selections``
        (``option_id`` and ``quantity`` 1 to 20) replaces all their meal picks for the edition and ``attendance``
        (``question_id``, ``attending`` and ``people`` including themselves) all their yes/no answers, so list
        every answer they gave. ``choices`` contains question_id/option_id, ``texts`` question_id/text
        (up to 500 characters), and ``ratings`` question_id/rating (1–5). These also fully replace the
        edition's answers. ``note`` omitted keeps their dietary note, an empty string clears it. A change
        to a closed question needs ``confirm_closed`` to be true. Audited with you as the actor. Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_poll.set_volunteer_poll_order(
            self.session_factory,
            self._actor(),
            edition_id=edition_id,
            volunteer_id=volunteer_id,
            selections=selections,
            attendance=attendance,
            choices=choices,
            texts=texts,
            ratings=ratings,
            note=note,
            confirm_closed=confirm_closed,
        )
