"""Admin tools for editions, events, event and product categories, products and waitlists.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime

from app.core.translations import Language
from app.mcp.admin import editions as mcp_admin_editions
from app.mcp.admin import event_categories as mcp_admin_event_categories
from app.mcp.admin import events as mcp_admin_events
from app.mcp.admin import product_categories as mcp_admin_product_categories
from app.mcp.admin import products as mcp_admin_products
from app.mcp.admin import waitlist as mcp_admin_waitlist
from app.mcp.tools.base import McpBackendBase
from app.schemas import (
    EditionType,
    SponsorTier,
)


class EditionsTools(McpBackendBase):
    """Admin tools for editions, events, event and product categories, products and waitlists."""

    async def list_event_categories(self, locale: Language | None = None) -> dict:
        """List the event categories (the valid ``category`` values for events) in display order.

        ``label`` is resolved for ``locale`` (``nl``, ``fr`` or ``en``) and falls back to the
        category's Dutch label; every stored label is also returned.
        """
        return await mcp_admin_event_categories.list_event_categories(self.session_factory, locale)

    async def list_product_categories(self, locale: Language | None = None) -> dict:
        """List the product categories (the valid ``category`` values for products) in display order.

        ``label`` is resolved for ``locale`` (``nl``, ``fr`` or ``en``) and falls back to the
        category's Dutch label; every stored label is also returned.
        """
        return await mcp_admin_product_categories.list_product_categories(self.session_factory, locale)

    async def create_edition(
        self,
        id: str,
        year: int,
        month: str,
        venue_id: str,
        edition_type: EditionType = "festival",
        organizations: list[int] | None = None,
        sponsor_tiers: dict[int, SponsorTier] | None = None,
        co_organizer_organization_id: int | None = None,
        active: bool = True,
    ) -> dict:
        """Create a festival/bourse/capsule-exchange edition. Requires the ``admin`` role.

        Only festival editions may carry an ``organizations`` lineup, whose order is the
        order they are listed in on the public site. ``sponsor_tiers`` maps a lineup
        sponsor's organization id to ``"main"``, ``"partner"`` or ``"supporter"``. See
        ``list_editions`` for public discovery of existing edition ids.
        """
        self._require_admin()
        return await mcp_admin_editions.create_edition(
            self.session_factory,
            self._actor(),
            id=id,
            year=year,
            month=month,
            venue_id=venue_id,
            edition_type=edition_type,
            organizations=organizations,
            sponsor_tiers=sponsor_tiers,
            co_organizer_organization_id=co_organizer_organization_id,
            active=active,
        )

    async def get_edition(self, edition_id: str) -> dict:
        """Return full admin detail for a single edition (including inactive events). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_editions.get_edition(self.session_factory, edition_id)

    async def update_edition(
        self,
        edition_id: str,
        year: int | None = None,
        month: str | None = None,
        venue_id: str | None = None,
        edition_type: EditionType | None = None,
        organizations: list[int] | None = None,
        sponsor_tiers: dict[int, SponsorTier] | None = None,
        co_organizer_organization_id: int | None = None,
        clear_co_organizer: bool = False,
        active: bool | None = None,
    ) -> dict:
        """Partially update an edition; omitted fields are left unchanged.

        ``organizations=None`` leaves the lineup unchanged — pass an explicit list
        (including an empty one) to replace it; its order is the public listing order.
        ``sponsor_tiers=None`` keeps the sponsor levels (``"main"``, ``"partner"``,
        ``"supporter"`` per lineup sponsor id); pass a mapping (including an empty one)
        to replace them. ``co_organizer_organization_id`` has
        no natural "clear" value, so pass ``clear_co_organizer=True`` to unset it.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_editions.update_edition(
            self.session_factory,
            self._actor(),
            edition_id,
            year=year,
            month=month,
            venue_id=venue_id,
            edition_type=edition_type,
            organizations=organizations,
            sponsor_tiers=sponsor_tiers,
            co_organizer_organization_id=co_organizer_organization_id,
            clear_co_organizer=clear_co_organizer,
            active=active,
        )

    async def delete_edition(self, edition_id: str) -> dict:
        """Delete an edition. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_editions.delete_edition(self.session_factory, self._actor(), edition_id)

    async def create_event(
        self,
        edition_id: str,
        date: dt_date,
        start_time: str,
        category: str,
        title_nl: str | None = None,
        title_fr: str | None = None,
        title_en: str | None = None,
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        end_time: str | None = None,
        volunteers_only: bool = False,
        members_only: bool = False,
        registration_required: bool = False,
        registrations_open_from: datetime | None = None,
        registrations_close_at: datetime | None = None,
        active: bool = True,
    ) -> dict:
        """Create an event within an edition. Requires the ``admin`` role.

        ``category`` is the key of an existing event category (see
        ``list_event_categories``). The title (and optional description) is stored per
        language: fill ``title_nl``/``title_fr``/``title_en`` (and optionally
        ``description_*``); the Dutch title is required.
        Visitors see their language and fall back to Dutch.

        Off-festival (bourse/capsule-exchange) editions may only contain events on
        a single date. ``registrations_open_from`` may only be set when
        ``registration_required`` is true.
        """
        self._require_admin()
        return await mcp_admin_events.create_event(
            self.session_factory,
            self._actor(),
            edition_id=edition_id,
            date=date,
            start_time=start_time,
            category=category,
            title_nl=title_nl,
            title_fr=title_fr,
            title_en=title_en,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            end_time=end_time,
            volunteers_only=volunteers_only,
            members_only=members_only,
            registration_required=registration_required,
            registrations_open_from=registrations_open_from,
            registrations_close_at=registrations_close_at,
            active=active,
        )

    async def get_event(self, event_id: str) -> dict:
        """Return full admin detail for a single event. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_events.get_event(self.session_factory, event_id)

    async def update_event(
        self,
        event_id: str,
        edition_id: str | None = None,
        title_nl: str | None = None,
        title_fr: str | None = None,
        title_en: str | None = None,
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        date: dt_date | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        category: str | None = None,
        volunteers_only: bool | None = None,
        members_only: bool | None = None,
        registration_required: bool | None = None,
        registrations_open_from: datetime | None = None,
        registrations_close_at: datetime | None = None,
        active: bool | None = None,
        clear_end_time: bool = False,
        clear_registrations_open_from: bool = False,
        clear_registrations_close_at: bool = False,
    ) -> dict:
        """Partially update an event; omitted fields are left unchanged.

        ``end_time``/``registrations_open_from``/``registrations_close_at`` have
        no natural "clear" value, so pass ``clear_end_time=True`` /
        ``clear_registrations_open_from=True`` / ``clear_registrations_close_at=True``
        to unset them instead of providing a value.

        Titles and descriptions are per language (``title_nl``/``title_fr``/``title_en``,
        ``description_*``); the Dutch text must be kept, and an empty
        string clears a translation. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_events.update_event(
            self.session_factory,
            self._actor(),
            event_id,
            edition_id=edition_id,
            title_nl=title_nl,
            title_fr=title_fr,
            title_en=title_en,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            date=date,
            start_time=start_time,
            end_time=end_time,
            category=category,
            volunteers_only=volunteers_only,
            members_only=members_only,
            registration_required=registration_required,
            registrations_open_from=registrations_open_from,
            registrations_close_at=registrations_close_at,
            active=active,
            clear_end_time=clear_end_time,
            clear_registrations_open_from=clear_registrations_open_from,
            clear_registrations_close_at=clear_registrations_close_at,
        )

    async def create_event_category(
        self,
        key: str,
        label_nl: str | None = None,
        label_fr: str | None = None,
        label_en: str | None = None,
        sort_order: int = 0,
    ) -> dict:
        """Create an event category. Requires the ``admin`` role.

        ``key`` is the stable identifier events store (lowercase letters, digits, ``-`` and
        ``_``) and cannot be changed later. The Dutch label is required; the
        other languages are optional and fall back to it.
        """
        self._require_admin()
        return await mcp_admin_event_categories.create_event_category(
            self.session_factory,
            self._actor(),
            key=key,
            label_nl=label_nl,
            label_fr=label_fr,
            label_en=label_en,
            sort_order=sort_order,
        )

    async def update_event_category(
        self,
        key: str,
        label_nl: str | None = None,
        label_fr: str | None = None,
        label_en: str | None = None,
        sort_order: int | None = None,
    ) -> dict:
        """Partially update an event category; omitted fields are left unchanged.

        An empty string clears a translation; the Dutch label cannot be
        cleared. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_event_categories.update_event_category(
            self.session_factory,
            self._actor(),
            key,
            label_nl=label_nl,
            label_fr=label_fr,
            label_en=label_en,
            sort_order=sort_order,
        )

    async def delete_event_category(self, key: str) -> dict:
        """Delete an event category. Refused while events still use it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_event_categories.delete_event_category(self.session_factory, self._actor(), key)

    async def create_product_category(
        self,
        key: str,
        label_nl: str | None = None,
        label_fr: str | None = None,
        label_en: str | None = None,
        sort_order: int = 0,
    ) -> dict:
        """Create a product category. Requires the ``admin`` role.

        ``key`` is the stable identifier products store (lowercase letters, digits, ``-`` and
        ``_``) and cannot be changed later. The Dutch label is required; the
        other languages are optional and fall back to it.
        """
        self._require_admin()
        return await mcp_admin_product_categories.create_product_category(
            self.session_factory,
            self._actor(),
            key=key,
            label_nl=label_nl,
            label_fr=label_fr,
            label_en=label_en,
            sort_order=sort_order,
        )

    async def update_product_category(
        self,
        key: str,
        label_nl: str | None = None,
        label_fr: str | None = None,
        label_en: str | None = None,
        sort_order: int | None = None,
    ) -> dict:
        """Partially update a product category; omitted fields are left unchanged.

        An empty string clears a translation; the Dutch label cannot be
        cleared. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_product_categories.update_product_category(
            self.session_factory,
            self._actor(),
            key,
            label_nl=label_nl,
            label_fr=label_fr,
            label_en=label_en,
            sort_order=sort_order,
        )

    async def delete_product_category(self, key: str) -> dict:
        """Delete a product category. Refused while products still use it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_product_categories.delete_product_category(self.session_factory, self._actor(), key)

    async def delete_event(self, event_id: str) -> dict:
        """Delete an event. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_events.delete_event(self.session_factory, self._actor(), event_id)

    async def create_product(
        self,
        event_id: str,
        price: float,
        category: str,
        name_nl: str | None = None,
        name_fr: str | None = None,
        name_en: str | None = None,
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        purchasable: bool = True,
        required: bool = False,
        unit: str = "item",
        stock: int | None = None,
        inclusions: list[dict] | None = None,
    ) -> dict:
        """Create a product for an event. Requires the ``admin`` role.

        ``category`` is the key of an existing product category (see
        ``list_product_categories``). The name (and optional description) is stored per language: fill
        ``name_nl``/``name_fr``/``name_en`` — the Dutch one is required — and likewise
        ``description_*`` (Dutch required when any description is given). Visitors see their
        language and fall back to Dutch.

        ``purchasable`` (default ``true``) decides both standalone order
        availability and visitor visibility: a purchasable product can be
        ordered directly and is shown wherever it appears, including as a
        package inclusion line. A ``purchasable=false`` ("hidden") product is
        never orderable directly and never named to a visitor, but can still
        be an inclusion target of another product and still counts toward
        stock/preparation totals — there is no separate "disabled" state; a
        withdrawn product is simply set to ``purchasable=false``. A
        ``required`` product must be purchasable. ``stock`` is
        ``null``/omitted for unlimited, ``0`` for sold out. ``inclusions``
        bundles a quantity of other products on this event into this one:
        each entry has ``product_id``, ``quantity``, ``per_quantity``,
        ``rounding`` (``up``/``down``) and ``basis`` (``quantity`` counts the
        units ordered of this product, ``guests`` counts the booking's guests,
        e.g. one bottle per two guests).
        """
        self._require_admin()
        return await mcp_admin_products.create_product(
            self.session_factory,
            self._actor(),
            event_id=event_id,
            name_nl=name_nl,
            name_fr=name_fr,
            name_en=name_en,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            price=price,
            category=category,
            purchasable=purchasable,
            required=required,
            unit=unit,
            stock=stock,
            inclusions=inclusions,
        )

    async def get_product(self, product_id: str) -> dict:
        """Return full admin detail for a single product. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_products.get_product(self.session_factory, product_id)

    async def list_products(self, event_id: str | None = None) -> list[dict]:
        """List products, optionally filtered by event. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_products.list_products(self.session_factory, event_id)

    async def update_product(
        self,
        product_id: str,
        name_nl: str | None = None,
        name_fr: str | None = None,
        name_en: str | None = None,
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        price: float | None = None,
        category: str | None = None,
        purchasable: bool | None = None,
        required: bool | None = None,
        unit: str | None = None,
        stock: int | None = None,
        inclusions: list[dict] | None = None,
        clear_stock: bool = False,
        clear_inclusions: bool = False,
        update_existing_contents: bool = False,
        update_existing_prices: bool = False,
        confirm_shortage: bool = False,
        preview_token: str | None = None,
    ) -> dict:
        """Partially update a product; omitted fields are left unchanged.

        Name and description are per language: an empty string clears a
        translation, and the Dutch name must be kept.
        ``stock`` has no natural "clear" value, so pass ``clear_stock=True`` to
        unset it; ``clear_inclusions=True`` (or ``inclusions=[]``) removes every
        included product. A change affecting existing bookings' contents or prices
        needs a fresh ``preview_token``: call once with
        ``update_existing_contents``/``update_existing_prices`` set to preview
        (the result carries ``preview_token``), then again with that token to
        save. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_products.update_product(
            self.session_factory,
            self._actor(),
            product_id,
            name_nl=name_nl,
            name_fr=name_fr,
            name_en=name_en,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            price=price,
            category=category,
            purchasable=purchasable,
            required=required,
            unit=unit,
            stock=stock,
            inclusions=inclusions,
            clear_stock=clear_stock,
            clear_inclusions=clear_inclusions,
            update_existing_contents=update_existing_contents,
            update_existing_prices=update_existing_prices,
            confirm_shortage=confirm_shortage,
            preview_token=preview_token,
        )

    async def delete_product(self, product_id: str) -> dict:
        """Delete a product. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_products.delete_product(self.session_factory, self._actor(), product_id)

    async def list_waitlist_entries(self, product_id: str | None = None, event_id: str | None = None) -> dict:
        """List sold-out waitlist entries (visitor name, email, phone), oldest first, optionally for one
        product or event. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_waitlist.list_waitlist_entries(
            self.session_factory, product_id=product_id, event_id=event_id
        )

    async def mark_waitlist_entry_handled(self, entry_id: str) -> dict:
        """Mark a waitlist entry as handled (contacted); repeating keeps the original timestamp.
        Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_waitlist.mark_waitlist_entry_handled(self.session_factory, entry_id)

    async def delete_waitlist_entry(self, entry_id: str) -> dict:
        """Delete a waitlist entry. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_waitlist.delete_waitlist_entry(self.session_factory, entry_id)
