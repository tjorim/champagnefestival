"""Floor-plan layouts, their revisions and restore previews."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.actors import ActorLabel
from app.schemas.areas import AreaOut
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.tables import ROTATION_DESCRIPTION, X_POSITION_DESCRIPTION, Y_POSITION_DESCRIPTION, TableOut
from app.schemas.types import NonEmptyText200, ResourceId, Text200, Text2000


class LayoutCreate(RequestModel):
    event_id: ResourceId
    room_id: ResourceId
    label: Text200 = ""


class LayoutCopyCreate(LayoutCreate):
    copy_tables: bool = True
    copy_areas: bool = True


class LayoutOut(ResponseModel):
    event_id: str
    event_title: str
    id: str
    edition_id: str | None
    room_id: str
    date: dt_date | None
    label: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LayoutBulkCreate(RequestModel):
    """Create several layouts in one atomic transaction (#837).

    All items are validated and, within the batch, checked against each other
    for the same room+event duplication ``create_layout`` already
    rejects — a failure partway through leaves no layout created. Pass
    ``idempotency_key`` to safely retry after a timeout or partial failure
    without risking duplicates.
    """

    items: list[LayoutCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class LayoutBulkOut(ResponseModel):
    items: list[LayoutOut]


class LayoutWithTablesOut(LayoutOut):
    """``LayoutOut`` plus its tables/areas, returned by ``GET /api/layouts/{id}``
    when ``include_tables=true`` is passed (or the MCP ``get_layout`` tool's
    ``include_tables`` argument). ``tables``/``areas`` are ``None`` unless
    requested, so a scoped single-layout read no longer requires a separate
    global ``list_tables``/``list_areas`` scan and client-side join.
    """

    tables: list[TableOut] | None = None
    areas: list[AreaOut] | None = None


# The reserved "current" ref lets compare/restore-preview treat the live
# arrangement as one more revision without a separate endpoint — see
# app.services.layouts_service.compare_layout_revisions.
CURRENT_REVISION_REF = "current"


class LayoutRevisionSnapshotTable(ResponseModel):
    """One table's stable identity and geometry, captured at save-revision time.

    ``id`` is the source ``Table.id`` — the stable identity compare/restore
    match on, never the mutable ``name``.
    """

    id: str
    name: str
    x: float = Field(description=X_POSITION_DESCRIPTION)
    y: float = Field(description=Y_POSITION_DESCRIPTION)
    rotation: int = Field(description=ROTATION_DESCRIPTION)
    table_type_id: str
    table_type_name: str
    capacity: int
    width_m: float
    length_m: float


class LayoutRevisionSnapshotArea(ResponseModel):
    """One area's stable identity and geometry, captured at save-revision time.

    ``id`` is the source ``Area.id`` — the stable identity compare/restore
    match on, never the mutable ``label``. Deliberately excludes
    ``organization_id``: allocations are live operational data, not part of any
    revision (see ``LayoutRevisionSnapshot``).
    """

    id: str
    label: str
    icon: str
    x: float = Field(description=X_POSITION_DESCRIPTION)
    y: float = Field(description=Y_POSITION_DESCRIPTION)
    rotation: int = Field(description=ROTATION_DESCRIPTION)
    width_m: float
    length_m: float


class LayoutRevisionSnapshotRoom(ResponseModel):
    width_m: float
    length_m: float


class LayoutRevisionSnapshot(ResponseModel):
    """A geometry-only snapshot of a layout's tables and areas.

    Excludes allocations (``Registration``/``RegistrationAllocation``) and
    area ``organization_id`` — those remain live operational data outside any
    revision's scope (#1021 acceptance criteria).
    """

    tables: list[LayoutRevisionSnapshotTable]
    areas: list[LayoutRevisionSnapshotArea]
    room: LayoutRevisionSnapshotRoom


class LayoutRevisionOut(ResponseModel):
    id: str
    layout_id: str
    revision_number: int
    label: str
    change_note: str | None
    created_by: str
    actor_label: ActorLabel
    created_at: datetime
    snapshot: LayoutRevisionSnapshot

    model_config = ConfigDict(from_attributes=True)


class LayoutRevisionSummaryOut(BaseModel):
    """Lightweight revision listing shape, without the (potentially large) snapshot."""

    id: str
    layout_id: str
    revision_number: int
    label: str
    change_note: str | None
    created_by: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LayoutRevisionSaveRequest(RequestModel):
    label: NonEmptyText200
    change_note: Text2000 | None = None

    @field_validator("label", mode="before")
    @classmethod
    def strip_label(cls, value: str) -> str:
        # Stripped before min_length is enforced so a whitespace-only label
        # (e.g. "   ") is rejected rather than silently persisted as "".
        return value.strip() if isinstance(value, str) else value


class LayoutRevisionFieldChange(ResponseModel):
    field: str
    before: Any
    after: Any


class LayoutRevisionTableChange(ResponseModel):
    id: str
    before: LayoutRevisionSnapshotTable
    after: LayoutRevisionSnapshotTable
    changes: list[LayoutRevisionFieldChange]


class LayoutRevisionAreaChange(ResponseModel):
    id: str
    before: LayoutRevisionSnapshotArea
    after: LayoutRevisionSnapshotArea
    changes: list[LayoutRevisionFieldChange]


class LayoutRevisionDiff(ResponseModel):
    """Result of comparing two snapshots (each a revision or the live ``current``
    draft), matching tables/areas by stable ``id`` rather than name/label."""

    layout_id: str
    from_ref: str
    to_ref: str
    added_tables: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    removed_tables: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    changed_tables: list[LayoutRevisionTableChange] = Field(default_factory=list)
    added_areas: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    removed_areas: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    changed_areas: list[LayoutRevisionAreaChange] = Field(default_factory=list)


class LayoutRestoreAllocationConflict(ResponseModel):
    """One live allocation that would be silently invalidated by a restore.

    Restoring never touches ``Registration``/``Area.organization_id`` itself —
    this only flags that the *geometry* change (delete/move) would orphan an
    existing allocation, so the caller can make a deliberate call via
    ``LayoutRestoreRequest.resolve_allocations``.
    """

    kind: Literal["table", "area"]
    id: str
    name: str
    reason: Literal["deleted", "moved"]
    registration_ids: list[str] = Field(default_factory=list)
    organization_id: int | None = None


class LayoutRestorePreview(ResponseModel):
    layout_id: str
    revision_number: int
    tables_to_add: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    tables_to_update: list[LayoutRevisionTableChange] = Field(default_factory=list)
    tables_to_remove: list[LayoutRevisionSnapshotTable] = Field(default_factory=list)
    areas_to_add: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    areas_to_update: list[LayoutRevisionAreaChange] = Field(default_factory=list)
    areas_to_remove: list[LayoutRevisionSnapshotArea] = Field(default_factory=list)
    allocation_conflicts: list[LayoutRestoreAllocationConflict] = Field(default_factory=list)
    has_conflicts: bool = False


class LayoutRestoreRequest(RequestModel):
    resolve_allocations: bool = False
