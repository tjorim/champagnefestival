"""Admin tools for digital signage: channels, templates, slides, playlists and video exports.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.mcp.admin import signage as mcp_admin_signage
from app.mcp.admin import signage_video as mcp_admin_signage_video
from app.mcp.tools.base import McpBackendBase
from app.schemas import (
    FaqLocale,
)
from app.schemas.signage import SlideKind as SignageSlideKind


class SignageTools(McpBackendBase):
    """Admin tools for digital signage: channels, templates, slides, playlists and video exports."""

    async def list_signage_channels(self) -> dict:
        """List the signage channels (one per physical display group). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.list_signage_channels(self.session_factory)

    async def get_signage_channel(self, channel_id: str) -> dict:
        """Get one signage channel. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.get_signage_channel(self.session_factory, channel_id)

    async def create_signage_channel(self, slug: str, name: str, edition_id: str, active: bool = False) -> dict:
        """Create a signage channel for an edition. ``slug`` is the lowercase-and-hyphens name its
        displays request; it must be unique. Displays only receive an ``active`` channel. Requires
        the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.create_signage_channel(
            self.session_factory, self._actor(), slug=slug, name=name, edition_id=edition_id, active=active
        )

    async def update_signage_channel(
        self,
        channel_id: str,
        slug: str | None = None,
        name: str | None = None,
        edition_id: str | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update a signage channel; omitted fields are left unchanged. Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.update_signage_channel(
            self.session_factory,
            self._actor(),
            channel_id,
            slug=slug,
            name=name,
            edition_id=edition_id,
            active=active,
        )

    async def delete_signage_channel(self, channel_id: str) -> dict:
        """Delete a signage channel together with its slides. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.delete_signage_channel(self.session_factory, self._actor(), channel_id)

    async def list_signage_templates(self) -> dict:
        """List the signage slide templates (a background plus positioned layers). Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.list_signage_templates(self.session_factory)

    async def get_signage_template(self, template_id: str) -> dict:
        """Get one signage template. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.get_signage_template(self.session_factory, template_id)

    async def create_signage_template(
        self,
        name: str,
        background: dict[str, Any] | None = None,
        layers: list[dict[str, Any]] | None = None,
    ) -> dict:
        """Create a signage template. ``background`` is ``{kind: color|gradient|image, color, end_color,
        image}``; each of ``layers`` has an ``id`` and a ``kind`` (``binding``, ``text``, ``image``,
        ``icon`` or ``shape``) plus position (``x``, ``y``, ``width``, ``height`` in percent),
        ``rotation``, ``color``, ``font_size`` and so on. A ``binding`` layer shows slide data
        (``logo``, ``name``, ``description``, ``sponsor``, ``title``, ``text``, ``icon``); organization
        slides need the ``logo``, ``name`` and ``sponsor`` bindings and notices ``title`` and ``text``.
        Images must have been uploaded in the admin UI first. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.create_signage_template(
            self.session_factory, self._actor(), name=name, background=background, layers=layers
        )

    async def update_signage_template(
        self,
        template_id: str,
        name: str | None = None,
        background: dict[str, Any] | None = None,
        layers: list[dict[str, Any]] | None = None,
    ) -> dict:
        """Partially update a signage template; ``background`` and ``layers`` are replaced as a whole
        when given. Rejected if it would drop a placeholder an existing slide needs. Requires the
        ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.update_signage_template(
            self.session_factory, self._actor(), template_id, name=name, background=background, layers=layers
        )

    async def delete_signage_template(self, template_id: str) -> dict:
        """Delete a signage template that no slide uses. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.delete_signage_template(self.session_factory, self._actor(), template_id)

    async def list_signage_slides(self) -> dict:
        """List the signage slides of every channel. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.list_signage_slides(self.session_factory)

    async def get_signage_slide(self, slide_id: str) -> dict:
        """Get one signage slide. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.get_signage_slide(self.session_factory, slide_id)

    async def create_signage_slide(
        self,
        channel_id: str,
        template_id: str,
        kind: SignageSlideKind,
        duration: int = 10,
        active: bool = False,
        starts_at: datetime | None = None,
        ends_at: datetime | None = None,
        content: dict[str, Any] | None = None,
    ) -> dict:
        """Create a signage slide. ``kind`` is ``organizations`` (one slide per organization),
        ``notice`` (needs ``content.text``) or ``image`` (needs an uploaded ``content.image``);
        ``content`` also takes ``title``, ``icon`` and, for organizations, ``organization_type``.
        ``duration`` is in seconds and ``starts_at``/``ends_at`` need a timezone. It is appended after
        the channel's last slide. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.create_signage_slide(
            self.session_factory,
            self._actor(),
            channel_id=channel_id,
            template_id=template_id,
            kind=kind,
            duration=duration,
            active=active,
            starts_at=starts_at,
            ends_at=ends_at,
            content=content,
        )

    async def update_signage_slide(
        self,
        slide_id: str,
        channel_id: str | None = None,
        template_id: str | None = None,
        kind: SignageSlideKind | None = None,
        duration: int | None = None,
        active: bool | None = None,
        starts_at: datetime | None = None,
        clear_starts_at: bool = False,
        ends_at: datetime | None = None,
        clear_ends_at: bool = False,
        content: dict[str, Any] | None = None,
    ) -> dict:
        """Partially update a signage slide; omitted fields are left unchanged and ``content`` is
        replaced as a whole when given. ``clear_starts_at`` / ``clear_ends_at`` remove that end of
        the schedule window. Display position isn't settable here — use ``reorder_signage_slides``.
        Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.update_signage_slide(
            self.session_factory,
            self._actor(),
            slide_id,
            channel_id=channel_id,
            template_id=template_id,
            kind=kind,
            duration=duration,
            active=active,
            starts_at=starts_at,
            clear_starts_at=clear_starts_at,
            ends_at=ends_at,
            clear_ends_at=clear_ends_at,
            content=content,
        )

    async def delete_signage_slide(self, slide_id: str) -> dict:
        """Delete a signage slide. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.delete_signage_slide(self.session_factory, self._actor(), slide_id)

    async def reorder_signage_slides(self, channel_id: str, ordered_ids: list[str]) -> dict:
        """Reassign the display order of a channel's slides; ``ordered_ids`` must name every slide of
        that channel exactly once. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.reorder_signage_slides(
            self.session_factory, self._actor(), channel_id, ordered_ids=ordered_ids
        )

    async def get_signage_playlist(self, channel_slug: str, locale: FaqLocale = "nl") -> dict:
        """Get the playlist a display of an active channel receives right now, in ``locale``.
        Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.get_signage_playlist(self.session_factory, channel_slug, locale=locale)

    async def preview_signage_playlist(
        self, channel: dict[str, Any], slides: list[dict[str, Any]], at: datetime, locale: FaqLocale = "nl"
    ) -> dict:
        """Preview the playlist that unsaved ``channel`` and ``slides`` documents (the same fields as
        ``create_signage_channel`` / ``create_signage_slide``, with ``channel_id`` and ``template_id``
        pointing at stored rows) would produce at the timestamp ``at`` (needs a timezone). Nothing is
        saved. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage.preview_signage_playlist(
            self.session_factory, channel=channel, slides=slides, at=at, locale=locale
        )

    async def get_signage_video_capability(self) -> dict:
        """Whether signage video export is available (a media worker is configured) and the slide and
        duration limits an export must stay within. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage_video.get_signage_video_capability()

    async def list_signage_video_exports(self) -> dict:
        """List your own signage video exports, live ones first. Exports are created and downloaded in
        the admin UI, which renders and uploads the slide images. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage_video.list_signage_video_exports(self.session_factory, self._actor())

    async def get_signage_video_export(self, job_id: str) -> dict:
        """Get the state of one of your own signage video exports. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage_video.get_signage_video_export(self.session_factory, self._actor(), job_id)

    async def cancel_signage_video_export(self, job_id: str) -> dict:
        """Request cancellation of one of your own signage video exports. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_signage_video.cancel_signage_video_export(self.session_factory, self._actor(), job_id)
