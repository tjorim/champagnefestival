"""Admin tools for the venue plan: venues, rooms, table types, tables, layouts and areas.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

from app.core.vocabularies import TableHeight, TableShape
from app.mcp.admin import areas as mcp_admin_areas
from app.mcp.admin import layouts as mcp_admin_layouts
from app.mcp.admin import rooms as mcp_admin_rooms
from app.mcp.admin import table_types as mcp_admin_table_types
from app.mcp.admin import tables as mcp_admin_tables
from app.mcp.admin import venues as mcp_admin_venues
from app.mcp.tools.base import McpBackendBase
from app.schemas import (
    ROTATION_DESCRIPTION,
    X_POSITION_DESCRIPTION,
    Y_POSITION_DESCRIPTION,
    LayoutCreate,
    RoomCreate,
    TableCreate,
    TableTypeCreate,
)


class VenueTools(McpBackendBase):
    """Admin tools for the venue plan: venues, rooms, table types, tables, layouts and areas."""

    async def create_venue(
        self,
        name: str,
        address: str = "",
        city: str = "",
        postal_code: str = "",
        country: str = "",
        lat: float | None = None,
        lng: float | None = None,
        active: bool = True,
    ) -> dict:
        """Create a venue. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.create_venue(
            self.session_factory,
            self._actor(),
            name=name,
            address=address,
            city=city,
            postal_code=postal_code,
            country=country,
            lat=lat,
            lng=lng,
            active=active,
        )

    async def list_venues(self) -> dict:
        """List all venues. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.list_venues(self.session_factory)

    async def get_venue(self, venue_id: str) -> dict:
        """Return a single venue. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.get_venue(self.session_factory, venue_id)

    async def update_venue(
        self,
        venue_id: str,
        name: str | None = None,
        address: str | None = None,
        city: str | None = None,
        postal_code: str | None = None,
        country: str | None = None,
        lat: float | None = None,
        lng: float | None = None,
        active: bool | None = None,
        clear_lat: bool = False,
        clear_lng: bool = False,
    ) -> dict:
        """Partially update a venue. Use clear_lat or clear_lng to clear a coordinate. Requires the admin role."""
        self._require_admin()
        return await mcp_admin_venues.update_venue(
            self.session_factory,
            self._actor(),
            venue_id,
            name=name,
            address=address,
            city=city,
            postal_code=postal_code,
            country=country,
            lat=lat,
            lng=lng,
            active=active,
            clear_lat=clear_lat,
            clear_lng=clear_lng,
        )

    async def delete_venue(self, venue_id: str) -> dict:
        """Delete a venue. Fails if editions or rooms still reference it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_venues.delete_venue(self.session_factory, self._actor(), venue_id)

    async def create_room(
        self,
        name: str,
        venue_id: str,
        width_m: float,
        length_m: float,
        color: str = "#6c757d",
        active: bool = True,
    ) -> dict:
        """Create a room within a venue. Requires the ``admin`` role.

        ``width_m``/``length_m`` are the room's real measured dimensions in
        metres — there is no defensible generic default, so both are required.
        """
        self._require_admin()
        return await mcp_admin_rooms.create_room(
            self.session_factory,
            self._actor(),
            name=name,
            venue_id=venue_id,
            width_m=width_m,
            length_m=length_m,
            color=color,
            active=active,
        )

    async def list_rooms(self, venue_id: str | None = None) -> dict:
        """List rooms, optionally filtered by ``venue_id``. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.list_rooms(self.session_factory, venue_id)

    async def get_room(self, room_id: str) -> dict:
        """Return a single room. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.get_room(self.session_factory, room_id)

    async def update_room(
        self,
        room_id: str,
        venue_id: str | None = None,
        name: str | None = None,
        width_m: float | None = None,
        length_m: float | None = None,
        color: str | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update a room; omitted fields are left unchanged. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.update_room(
            self.session_factory,
            self._actor(),
            room_id,
            venue_id=venue_id,
            name=name,
            width_m=width_m,
            length_m=length_m,
            color=color,
            active=active,
        )

    async def delete_room(self, room_id: str) -> dict:
        """Delete a room. Fails if layouts still reference it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_rooms.delete_room(self.session_factory, self._actor(), room_id)

    async def bulk_create_rooms(self, items: list[RoomCreate], idempotency_key: str | None = None) -> dict:
        """Create several rooms in one atomic transaction. Requires the ``admin`` role.

        All rooms are validated up front; if any item is invalid, none are
        created. Pass the same ``idempotency_key`` on a retry (e.g. after a
        timeout) to safely replay the original result instead of creating
        duplicates — reusing the key with a different ``items`` payload is
        rejected.
        """
        self._require_admin()
        return await mcp_admin_rooms.bulk_create_rooms(
            self.session_factory, self._actor(), items=items, idempotency_key=idempotency_key
        )

    async def create_table_type(
        self,
        name: str,
        venue_id: str,
        capacity: int,
        width_m: float,
        length_m: float,
        shape: TableShape = "rectangle",
        height_type: TableHeight = "low",
        active: bool = True,
    ) -> dict:
        """Create a table type within a venue. Requires the ``admin`` role.

        ``width_m``/``length_m`` are the table's real measured dimensions in
        metres — there is no defensible generic default, so both are required.
        For ``shape="round"`` only the diameter matters: pass it as either
        ``width_m`` or ``length_m`` (the larger of the two is used).

        ``height_type`` is ``"low"`` for a standard seated dining table, or
        ``"high"`` for a high-top/cocktail-height standing table.
        """
        self._require_admin()
        return await mcp_admin_table_types.create_table_type(
            self.session_factory,
            self._actor(),
            name=name,
            venue_id=venue_id,
            shape=shape,
            width_m=width_m,
            length_m=length_m,
            height_type=height_type,
            capacity=capacity,
            active=active,
        )

    async def list_table_types(self) -> dict:
        """List all table types. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_table_types.list_table_types(self.session_factory)

    async def get_table_type(self, type_id: str) -> dict:
        """Return a single table type. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_table_types.get_table_type(self.session_factory, type_id)

    async def update_table_type(
        self,
        type_id: str,
        venue_id: str | None = None,
        name: str | None = None,
        shape: TableShape | None = None,
        width_m: float | None = None,
        length_m: float | None = None,
        height_type: TableHeight | None = None,
        capacity: int | None = None,
        active: bool | None = None,
    ) -> dict:
        """Partially update a table type; omitted fields are left unchanged.

        Changing ``shape`` to ``"round"`` (or updating dimensions) re-normalises
        ``length_m``/``width_m`` the same way the REST endpoint does.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_table_types.update_table_type(
            self.session_factory,
            self._actor(),
            type_id,
            venue_id=venue_id,
            name=name,
            shape=shape,
            width_m=width_m,
            length_m=length_m,
            height_type=height_type,
            capacity=capacity,
            active=active,
        )

    async def delete_table_type(self, type_id: str) -> dict:
        """Delete a table type. Fails if tables still use it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_table_types.delete_table_type(self.session_factory, self._actor(), type_id)

    async def bulk_create_table_types(self, items: list[TableTypeCreate], idempotency_key: str | None = None) -> dict:
        """Create several table types in one atomic transaction. Requires the ``admin`` role.

        All items are validated up front; if any is invalid, none are
        created. Pass the same ``idempotency_key`` on a retry (e.g. after a
        timeout) to safely replay the original result instead of creating
        duplicates — reusing the key with a different ``items`` payload is
        rejected.
        """
        self._require_admin()
        return await mcp_admin_table_types.bulk_create_table_types(
            self.session_factory, self._actor(), items=items, idempotency_key=idempotency_key
        )

    async def create_table(
        self,
        name: str,
        table_type_id: str,
        layout_id: str,
        x: Annotated[float, Field(ge=0, le=100, description=X_POSITION_DESCRIPTION)] = 50.0,
        y: Annotated[float, Field(ge=0, le=100, description=Y_POSITION_DESCRIPTION)] = 50.0,
        rotation: Annotated[int, Field(ge=0, le=359, description=ROTATION_DESCRIPTION)] = 0,
    ) -> dict:
        """Create a table on a layout. Requires the ``admin`` role.

        See ``docs/floor-plan-coordinates.md`` for the full ``x``/``y``/``rotation``
        coordinate contract.
        """
        self._require_admin()
        return await mcp_admin_tables.create_table(
            self.session_factory,
            self._actor(),
            name=name,
            table_type_id=table_type_id,
            layout_id=layout_id,
            x=x,
            y=y,
            rotation=rotation,
        )

    async def list_tables(self, layout_id: str | None = None) -> dict:
        """List tables, optionally filtered by ``layout_id``. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.list_tables(self.session_factory, layout_id)

    async def get_table(self, table_id: str) -> dict:
        """Return a single table, including its current registration ids. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.get_table(self.session_factory, table_id)

    async def update_table(
        self,
        table_id: str,
        name: str | None = None,
        x: Annotated[float, Field(ge=0, le=100, description=X_POSITION_DESCRIPTION)] | None = None,
        y: Annotated[float, Field(ge=0, le=100, description=Y_POSITION_DESCRIPTION)] | None = None,
        table_type_id: str | None = None,
        rotation: Annotated[int, Field(ge=0, le=359, description=ROTATION_DESCRIPTION)] | None = None,
        layout_id: str | None = None,
    ) -> dict:
        """Partially update a table; omitted fields are left unchanged. Requires the ``admin`` role.

        Use it to move, reposition or rotate a table on the floor plan, rename it, or
        change its table type or layout. See ``create_table`` for the ``x``/``y``/
        ``rotation`` coordinate contract.
        """
        self._require_admin()
        return await mcp_admin_tables.update_table(
            self.session_factory,
            self._actor(),
            table_id,
            name=name,
            x=x,
            y=y,
            table_type_id=table_type_id,
            rotation=rotation,
            layout_id=layout_id,
        )

    async def delete_table(self, table_id: str) -> dict:
        """Delete a table. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_tables.delete_table(self.session_factory, self._actor(), table_id)

    async def bulk_create_tables(self, items: list[TableCreate], idempotency_key: str | None = None) -> dict:
        """Create several tables in one atomic transaction. Requires the ``admin`` role.

        All tables are validated up front; if any item is invalid, none are
        created. Pass the same ``idempotency_key`` on a retry (e.g. after a
        timeout) to safely replay the original result instead of creating
        duplicates — reusing the key with a different ``items`` payload is
        rejected. See ``create_table`` for the ``x``/``y``/``rotation``
        coordinate contract.
        """
        self._require_admin()
        return await mcp_admin_tables.bulk_create_tables(
            self.session_factory, self._actor(), items=items, idempotency_key=idempotency_key
        )

    async def create_layout(
        self,
        room_id: str,
        event_id: str,
        label: str = "",
    ) -> dict:
        """Create a floor-plan layout for a room. The event determines the edition and date.

        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_layouts.create_layout(
            self.session_factory,
            self._actor(),
            room_id=room_id,
            event_id=event_id,
            label=label,
        )

    async def copy_layout(
        self,
        source_layout_id: str,
        room_id: str,
        event_id: str,
        label: str = "",
        copy_tables: bool = True,
        copy_areas: bool = True,
    ) -> dict:
        """Copy a layout's tables/areas onto a new room+event. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.copy_layout(
            self.session_factory,
            self._actor(),
            source_layout_id,
            room_id=room_id,
            event_id=event_id,
            label=label,
            copy_tables=copy_tables,
            copy_areas=copy_areas,
        )

    async def bulk_create_layouts(self, items: list[LayoutCreate], idempotency_key: str | None = None) -> dict:
        """Create several floor-plan layouts in one atomic transaction. Requires the ``admin`` role.

        All items are validated up front — including duplicate room+day+edition
        combinations both against existing layouts and within the batch itself
        — so if any is invalid, none are created. Pass the same
        ``idempotency_key`` on a retry (e.g. after a timeout) to safely replay
        the original result instead of creating duplicates — reusing the key
        with a different ``items`` payload is rejected.
        """
        self._require_admin()
        return await mcp_admin_layouts.bulk_create_layouts(
            self.session_factory, self._actor(), items=items, idempotency_key=idempotency_key
        )

    async def list_layouts(
        self, edition_id: str | None = None, room_id: str | None = None, event_id: str | None = None
    ) -> dict:
        """List layouts, optionally filtered by edition, room, or event.

        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_layouts.list_layouts(
            self.session_factory, edition_id=edition_id, room_id=room_id, event_id=event_id
        )

    async def get_layout(self, layout_id: str, include_tables: bool = False) -> dict:
        """Return a single layout. Requires the ``admin`` role.

        Pass ``include_tables=True`` to also return the layout's ``tables`` and
        ``areas`` in the same response, instead of a separate ``list_tables``/
        ``list_areas`` call scoped to this ``layout_id``.
        """
        self._require_admin()
        return await mcp_admin_layouts.get_layout(self.session_factory, layout_id, include_tables=include_tables)

    async def delete_layout(self, layout_id: str) -> dict:
        """Delete a layout. Fails if tables still reference it. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.delete_layout(self.session_factory, self._actor(), layout_id)

    async def save_layout_revision(self, layout_id: str, label: str, change_note: str | None = None) -> dict:
        """Save an immutable, named snapshot of a layout's current tables and areas.

        Requires the ``admin`` role. Allocations (registrations, organization
        assignments) are never captured — a revision is geometry only.
        """
        self._require_admin()
        return await mcp_admin_layouts.save_layout_revision(
            self.session_factory, self._actor(), layout_id, label=label, change_note=change_note
        )

    async def list_layout_revisions(self, layout_id: str) -> dict:
        """List a layout's saved revisions, newest first. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.list_layout_revisions(self.session_factory, layout_id)

    async def get_layout_revision(self, layout_id: str, revision_number: int) -> dict:
        """Return one saved revision, including its geometry snapshot. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.get_layout_revision(self.session_factory, layout_id, revision_number)

    async def compare_layout_revisions(self, layout_id: str, from_ref: str, to_ref: str) -> dict:
        """Compare two snapshots of one layout, matched by stable table/area id.

        Requires the ``admin`` role. ``from_ref``/``to_ref`` are each either a
        revision number (as a string) or the literal ``"current"`` for the
        live draft arrangement.
        """
        self._require_admin()
        return await mcp_admin_layouts.compare_layout_revisions(self.session_factory, layout_id, from_ref, to_ref)

    async def preview_layout_restore(self, layout_id: str, revision_number: int) -> dict:
        """Preview what restoring a revision would change, including any live
        allocations it would delete or move. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_layouts.preview_layout_restore(self.session_factory, layout_id, revision_number)

    async def restore_layout_revision(
        self, layout_id: str, revision_number: int, resolve_allocations: bool = False
    ) -> dict:
        """Apply a saved revision's snapshot back onto the layout's tables and areas.

        Requires the ``admin`` role. Refuses (see ``preview_layout_restore``)
        when the restore would delete or move a table/area with a live
        registration or organization assignment, unless ``resolve_allocations`` is
        set. Never modifies registrations or organization assignments itself.
        """
        self._require_admin()
        return await mcp_admin_layouts.restore_layout_revision(
            self.session_factory,
            self._actor(),
            layout_id,
            revision_number,
            resolve_allocations=resolve_allocations,
        )

    async def create_area(
        self,
        layout_id: str,
        label: str,
        icon: str = "bi-shop",
        organization_id: int | None = None,
        width_m: float = 1.5,
        length_m: float = 1.0,
        x: Annotated[float, Field(ge=0, le=100, description=X_POSITION_DESCRIPTION)] = 50.0,
        y: Annotated[float, Field(ge=0, le=100, description=Y_POSITION_DESCRIPTION)] = 50.0,
        rotation: Annotated[int, Field(ge=0, le=359, description=ROTATION_DESCRIPTION)] = 0,
    ) -> dict:
        """Create a floor-plan area (e.g. an organization booth) on a layout. Requires the ``admin`` role.

        See ``docs/floor-plan-coordinates.md`` for the ``x``/``y``/``rotation``
        coordinate contract (identical for areas and tables).
        """
        self._require_admin()
        return await mcp_admin_areas.create_area(
            self.session_factory,
            self._actor(),
            layout_id=layout_id,
            label=label,
            icon=icon,
            organization_id=organization_id,
            width_m=width_m,
            length_m=length_m,
            x=x,
            y=y,
            rotation=rotation,
        )

    async def list_areas(self, layout_id: str | None = None) -> dict:
        """List areas, optionally filtered by ``layout_id``. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_areas.list_areas(self.session_factory, layout_id)

    async def get_area(self, area_id: str) -> dict:
        """Return a single area. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_areas.get_area(self.session_factory, area_id)

    async def update_area(
        self,
        area_id: str,
        label: str | None = None,
        icon: str | None = None,
        organization_id: int | None = None,
        clear_organization_id: bool = False,
        width_m: float | None = None,
        length_m: float | None = None,
        x: Annotated[float, Field(ge=0, le=100, description=X_POSITION_DESCRIPTION)] | None = None,
        y: Annotated[float, Field(ge=0, le=100, description=Y_POSITION_DESCRIPTION)] | None = None,
        rotation: Annotated[int, Field(ge=0, le=359, description=ROTATION_DESCRIPTION)] | None = None,
    ) -> dict:
        """Partially update an area; omitted fields are left unchanged.

        ``organization_id`` has no natural "clear" value (a real id is never blank) —
        pass ``clear_organization_id=True`` to unassign the organization instead of
        providing an id. Requires the ``admin`` role. See
        ``docs/floor-plan-coordinates.md`` for the ``x``/``y``/``rotation`` contract.
        """
        self._require_admin()
        return await mcp_admin_areas.update_area(
            self.session_factory,
            self._actor(),
            area_id,
            label=label,
            icon=icon,
            organization_id=organization_id,
            clear_organization_id=clear_organization_id,
            width_m=width_m,
            length_m=length_m,
            x=x,
            y=y,
            rotation=rotation,
        )

    async def delete_area(self, area_id: str) -> dict:
        """Delete an area. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_areas.delete_area(self.session_factory, self._actor(), area_id)
