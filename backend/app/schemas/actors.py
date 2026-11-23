"""Read-time labels for actors in operational records."""

from typing import Literal

from app.schemas.base import ResponseModel


class ActorLabel(ResponseModel):
    kind: Literal["person", "integration", "visitor", "system", "unknown"]
    name: str | None = None
