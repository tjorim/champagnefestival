"""Table types and tables."""

from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import ConfigDict, Field, model_validator

from app.core.vocabularies import TableHeight, TableShape
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import FloorPlanPosition, FloorPlanRotation, NonEmptyText200, TableCapacity, TableDimension


class TableTypeCreate(RequestModel):
    name: NonEmptyText200
    venue_id: str
    shape: TableShape = "rectangle"
    # No defensible default exists for physical dimensions (unlike shape/height_type,
    # which have a legitimate industry-standard default) — required so a caller can't
    # silently persist a 0.7 x 1.8m table type without realising it (see #835).
    width_m: TableDimension
    length_m: TableDimension
    height_type: TableHeight = "low"
    capacity: TableCapacity
    active: bool = True

    @model_validator(mode="after")
    def normalise_dimensions(self) -> Self:
        from app.core.geometry import normalise_table_type_dimensions

        self.width_m, self.length_m = normalise_table_type_dimensions(self.shape, self.width_m, self.length_m)
        return self


class TableTypeUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    venue_id: str | None = None
    shape: TableShape | None = None
    width_m: TableDimension | None = None
    length_m: TableDimension | None = None
    height_type: TableHeight | None = None
    capacity: TableCapacity | None = None
    active: bool | None = None


class TableTypeOut(ResponseModel):
    id: str
    name: str
    venue_id: str
    shape: TableShape
    width_m: float
    length_m: float
    height_type: TableHeight
    capacity: int
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TableTypeBulkCreate(RequestModel):
    """Create several table types in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``venue_id`` on any item)
    leaves no table type created. Pass ``idempotency_key`` to safely retry
    after a timeout or partial failure without risking duplicates.
    """

    items: list[TableTypeCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class TableTypeBulkOut(ResponseModel):
    items: list[TableTypeOut]


# x/y/rotation semantics (percentage of the layout's rendered canvas, top-left
# origin, clockwise degrees) are shared by Table and Area — see
# docs/floor-plan-coordinates.md for the full contract, including why the
# canvas isn't a 1:1 percentage of the room's physical width_m/length_m.
# Public (no leading underscore) so app.mcp.server can reuse the same text for
# the MCP tool parameter schemas (see create_table/update_table/create_area/
# update_area there), keeping the wording identical across REST and MCP.
X_POSITION_DESCRIPTION = (
    "Horizontal position: percentage [0, 100] of the layout's rendered canvas width, "
    "from the left edge. See docs/floor-plan-coordinates.md."
)


Y_POSITION_DESCRIPTION = (
    "Vertical position: percentage [0, 100] of the layout's rendered canvas height, "
    "from the top edge. See docs/floor-plan-coordinates.md."
)


ROTATION_DESCRIPTION = "Clockwise rotation in whole degrees [0, 359], pivoting around this element's own center."


class TableCreate(RequestModel):
    name: NonEmptyText200
    x: FloorPlanPosition = Field(default=50.0, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition = Field(default=50.0, description=Y_POSITION_DESCRIPTION)
    table_type_id: str
    rotation: FloorPlanRotation = Field(default=0, description=ROTATION_DESCRIPTION)
    layout_id: str


class TableUpdate(RequestModel):
    name: NonEmptyText200 | None = None
    x: FloorPlanPosition | None = Field(default=None, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition | None = Field(default=None, description=Y_POSITION_DESCRIPTION)
    table_type_id: str | None = None
    rotation: FloorPlanRotation | None = Field(default=None, description=ROTATION_DESCRIPTION)
    layout_id: str | None = None


class TableOut(ResponseModel):
    event_id: str
    id: str
    name: str
    capacity: int
    x: float
    y: float
    table_type_id: str
    rotation: int
    layout_id: str
    registration_ids: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TableBulkCreate(RequestModel):
    """Create several tables in one atomic transaction (#837).

    A failure partway through (e.g. an unknown ``table_type_id`` or
    ``layout_id`` on any item) leaves no table created. Pass
    ``idempotency_key`` to safely retry after a timeout or partial failure
    without risking duplicates.
    """

    items: list[TableCreate] = Field(min_length=1, max_length=200)
    idempotency_key: NonEmptyText200 | None = None


class TableBulkOut(ResponseModel):
    items: list[TableOut]
