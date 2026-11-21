"""Floor-plan areas."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.tables import ROTATION_DESCRIPTION, X_POSITION_DESCRIPTION, Y_POSITION_DESCRIPTION
from app.schemas.types import AreaDimension, FloorPlanPosition, FloorPlanRotation, NonEmptyText200, Text50


class AreaCreate(RequestModel):
    layout_id: str = Field(max_length=64)
    label: NonEmptyText200
    icon: Text50 = "bi-shop"
    organization_id: int | None = None
    width_m: AreaDimension = 1.5
    length_m: AreaDimension = 1.0
    x: FloorPlanPosition = Field(default=50.0, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition = Field(default=50.0, description=Y_POSITION_DESCRIPTION)
    rotation: FloorPlanRotation = Field(default=0, description=ROTATION_DESCRIPTION)


class AreaUpdate(RequestModel):
    label: NonEmptyText200 | None = None
    icon: Text50 | None = None
    organization_id: int | None = None
    width_m: AreaDimension | None = None
    length_m: AreaDimension | None = None
    x: FloorPlanPosition | None = Field(default=None, description=X_POSITION_DESCRIPTION)
    y: FloorPlanPosition | None = Field(default=None, description=Y_POSITION_DESCRIPTION)
    rotation: FloorPlanRotation | None = Field(default=None, description=ROTATION_DESCRIPTION)


class AreaOut(ResponseModel):
    id: str
    layout_id: str
    icon: str
    organization_id: int | None
    label: str
    x: float
    y: float
    rotation: int
    width_m: float
    length_m: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
