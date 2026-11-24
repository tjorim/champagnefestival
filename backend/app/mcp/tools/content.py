"""Admin tools for content: FAQ, announcements, composed messages and policies.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from datetime import datetime

from app.mcp.admin import announcements as mcp_admin_announcements
from app.mcp.admin import composer as mcp_admin_composer
from app.mcp.admin import faq as mcp_admin_faq
from app.mcp.admin import policies as mcp_admin_policies
from app.mcp.tools.base import McpBackendBase
from app.schemas import (
    AnnouncementLevel,
    ComposedMessageToolChannel,
)


class ContentTools(McpBackendBase):
    """Admin tools for content: FAQ, announcements, composed messages and policies."""

    async def create_faq_item(
        self,
        question_nl: str | None = None,
        question_fr: str | None = None,
        question_en: str | None = None,
        answer_nl: str | None = None,
        answer_fr: str | None = None,
        answer_en: str | None = None,
        active: bool = True,
    ) -> dict:
        """Create an FAQ item, appended after the current last one. Requires the ``admin`` role.

        Fill the question and the answer in Dutch and
        optionally in the other languages; a language is shown only when both its
        question and answer are filled, otherwise visitors see Dutch.
        Display position isn't settable here — use ``reorder_faq_items`` to change it.
        """
        self._require_admin()
        return await mcp_admin_faq.create_faq_item(
            self.session_factory,
            self._actor(),
            question_nl=question_nl,
            question_fr=question_fr,
            question_en=question_en,
            answer_nl=answer_nl,
            answer_fr=answer_fr,
            answer_en=answer_en,
            active=active,
        )

    async def list_faq_items(self) -> dict:
        """List every FAQ item and locale, active or not (admin shape). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_faq.list_faq_items(self.session_factory)

    async def update_faq_item(
        self,
        faq_item_id: str,
        question_nl: str | None = None,
        question_fr: str | None = None,
        question_en: str | None = None,
        answer_nl: str | None = None,
        answer_fr: str | None = None,
        answer_en: str | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update an FAQ item; omitted fields are left unchanged.

        An explicit empty string clears a translation; the Dutch question
        and answer must be kept. Display position isn't
        settable here — use ``reorder_faq_items`` to change it. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_faq.update_faq_item(
            self.session_factory,
            self._actor(),
            faq_item_id,
            question_nl=question_nl,
            question_fr=question_fr,
            question_en=question_en,
            answer_nl=answer_nl,
            answer_fr=answer_fr,
            answer_en=answer_en,
            active=active,
        )

    async def delete_faq_item(self, faq_item_id: str) -> dict:
        """Delete an FAQ item. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_faq.delete_faq_item(self.session_factory, self._actor(), faq_item_id)

    async def reorder_faq_items(self, ordered_ids: list[str]) -> dict:
        """Reassign every FAQ item's display position to match ``ordered_ids``.

        ``ordered_ids`` must name every existing FAQ item exactly once — the
        same all-at-once semantics the admin UI's reorder control uses, so a
        reorder can't be partial, stale, or racing another admin's reorder.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_faq.reorder_faq_items(self.session_factory, self._actor(), ordered_ids=ordered_ids)

    async def list_announcements(self) -> dict:
        """List every site announcement, active or not, in display order (admin shape).
        Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_announcements.list_announcements(self.session_factory)

    async def create_announcement(
        self,
        text_nl: str | None = None,
        text_fr: str | None = None,
        text_en: str | None = None,
        level: AnnouncementLevel = "info",
        active: bool = False,
        starts_at: datetime | None = None,
        ends_at: datetime | None = None,
        link_url: str | None = None,
        link_label_nl: str | None = None,
        link_label_fr: str | None = None,
        link_label_en: str | None = None,
    ) -> dict:
        """Create a site announcement, appended after the current last one. Requires the ``admin`` role.

        The Dutch text is required; other languages are
        optional and visitors fall back to Dutch. A ``link_url`` needs a Dutch link label. It is shown to visitors only while ``active`` and inside
        the ``starts_at``/``ends_at`` window (timestamps must carry a timezone).
        """
        self._require_admin()
        return await mcp_admin_announcements.create_announcement(
            self.session_factory,
            self._actor(),
            text_nl=text_nl,
            text_fr=text_fr,
            text_en=text_en,
            level=level,
            active=active,
            starts_at=starts_at,
            ends_at=ends_at,
            link_url=link_url,
            link_label_nl=link_label_nl,
            link_label_fr=link_label_fr,
            link_label_en=link_label_en,
        )

    async def update_announcement(
        self,
        announcement_id: str,
        text_nl: str | None = None,
        text_fr: str | None = None,
        text_en: str | None = None,
        level: AnnouncementLevel | None = None,
        active: bool | None = None,
        starts_at: datetime | None = None,
        clear_starts_at: bool = False,
        ends_at: datetime | None = None,
        clear_ends_at: bool = False,
        link_url: str | None = None,
        clear_link_url: bool = False,
        link_label_nl: str | None = None,
        link_label_fr: str | None = None,
        link_label_en: str | None = None,
    ) -> dict:
        """Partially update an announcement; omitted fields are left unchanged.

        An explicit empty string clears a translation or a link label; ``clear_starts_at``,
        ``clear_ends_at`` and ``clear_link_url`` remove the window ends and the link. The
        Dutch text must be kept. Setting ``active`` publishes or unpublishes it.
        Display position isn't settable here — use ``reorder_announcements``. Requires the
        ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_announcements.update_announcement(
            self.session_factory,
            self._actor(),
            announcement_id,
            text_nl=text_nl,
            text_fr=text_fr,
            text_en=text_en,
            level=level,
            active=active,
            starts_at=starts_at,
            clear_starts_at=clear_starts_at,
            ends_at=ends_at,
            clear_ends_at=clear_ends_at,
            link_url=link_url,
            clear_link_url=clear_link_url,
            link_label_nl=link_label_nl,
            link_label_fr=link_label_fr,
            link_label_en=link_label_en,
        )

    async def reorder_announcements(self, ordered_ids: list[str]) -> dict:
        """Reassign every announcement's display position to match ``ordered_ids``, which must
        name every existing announcement exactly once. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_announcements.reorder_announcements(
            self.session_factory, self._actor(), ordered_ids=ordered_ids
        )

    async def delete_announcement(self, announcement_id: str) -> dict:
        """Delete an announcement. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_announcements.delete_announcement(self.session_factory, self._actor(), announcement_id)

    async def list_composed_messages(self) -> dict:
        """List every composed message (announcement and/or push), newest first, with its state
        and push delivery counts. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_composer.list_composed_messages(self.session_factory)

    async def get_composed_message(self, message_id: str) -> dict:
        """Get one composed message with its state and push delivery counts. Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_composer.get_composed_message(self.session_factory, message_id)

    async def create_composed_message(
        self,
        channels: list[ComposedMessageToolChannel],
        title_nl: str | None = None,
        title_fr: str | None = None,
        title_en: str | None = None,
        body_nl: str | None = None,
        body_fr: str | None = None,
        body_en: str | None = None,
        level: AnnouncementLevel = "info",
        link_url: str | None = None,
    ) -> dict:
        """Create a composed message as a draft; nothing is delivered until
        ``schedule_composed_message``. Requires the ``admin`` role.

        ``channels`` is ``announcement`` (site banner), ``push`` (notification to opted-in
        subscribers) or both. A Dutch title and body are required; a language is used only when both its title and body are filled.
        """
        self._require_admin()
        return await mcp_admin_composer.create_composed_message(
            self.session_factory,
            self._actor(),
            channels=channels,
            title_nl=title_nl,
            title_fr=title_fr,
            title_en=title_en,
            body_nl=body_nl,
            body_fr=body_fr,
            body_en=body_en,
            level=level,
            link_url=link_url,
        )

    async def update_composed_message(
        self,
        message_id: str,
        channels: list[ComposedMessageToolChannel] | None = None,
        title_nl: str | None = None,
        title_fr: str | None = None,
        title_en: str | None = None,
        body_nl: str | None = None,
        body_fr: str | None = None,
        body_en: str | None = None,
        level: AnnouncementLevel | None = None,
        link_url: str | None = None,
        clear_link_url: bool = False,
    ) -> dict:
        """Partially update a composed message that is still a draft; omitted fields are left
        unchanged, an explicit empty string clears a translation and ``clear_link_url`` removes the
        link. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_composer.update_composed_message(
            self.session_factory,
            self._actor(),
            message_id,
            channels=channels,
            title_nl=title_nl,
            title_fr=title_fr,
            title_en=title_en,
            body_nl=body_nl,
            body_fr=body_fr,
            body_en=body_en,
            level=level,
            link_url=link_url,
            clear_link_url=clear_link_url,
        )

    async def schedule_composed_message(self, message_id: str, scheduled_at: datetime | None = None) -> dict:
        """Send a draft composed message to its channels, which is visible to visitors and cannot
        be undone. Omit ``scheduled_at`` to send as soon as the worker next polls; otherwise give
        a timestamp with a timezone. A message that is no longer a draft is rejected. Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_composer.schedule_composed_message(
            self.session_factory, self._actor(), message_id, scheduled_at=scheduled_at
        )

    async def list_policies(self) -> dict:
        """List every legal/policy document with its full version history (Markdown source per
        language, newest version first). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_policies.list_policies(self.session_factory)

    async def get_policy(self, policy_key: str) -> dict:
        """Get one policy with its full version history. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_policies.get_policy(self.session_factory, policy_key)

    async def preview_policy_markdown(self, markdown: str) -> dict:
        """Render unsaved Markdown to the sanitized HTML visitors would get. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_policies.preview_policy_markdown(markdown)

    async def create_policy_draft(self, policy_key: str, source_version_number: int | None = None) -> dict:
        """Open a draft of a policy, seeded from the published version or, with
        ``source_version_number``, from an older version (publishing that draft is the rollback).
        A policy can have only one open draft. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_policies.create_policy_draft(
            self.session_factory, self._actor(), policy_key, source_version_number=source_version_number
        )

    async def update_policy_draft(
        self,
        policy_key: str,
        content_nl: str | None = None,
        content_fr: str | None = None,
        content_en: str | None = None,
        change_summary: str | None = None,
    ) -> dict:
        """Edit the open draft of a policy; omitted fields are left unchanged and an explicit empty
        string clears a translation. Publishing needs Dutch text. Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_policies.update_policy_draft(
            self.session_factory,
            self._actor(),
            policy_key,
            content_nl=content_nl,
            content_fr=content_fr,
            content_en=content_en,
            change_summary=change_summary,
        )

    async def discard_policy_draft(self, policy_key: str) -> dict:
        """Delete the open draft of a policy, leaving the published version as it is. Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_policies.discard_policy_draft(self.session_factory, self._actor(), policy_key)

    async def publish_policy_draft(self, policy_key: str) -> dict:
        """Publish the open draft of a policy, which is visible to visitors immediately; the
        previously published version becomes superseded. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_policies.publish_policy_draft(self.session_factory, self._actor(), policy_key)
