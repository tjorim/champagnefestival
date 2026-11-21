"""Waitlist entries."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import _utcnow

if TYPE_CHECKING:
    from app.models.products import Product


class WaitlistEntry(Base):
    """A visitor's request to be contacted if a sold-out product frees up.

    Scoped to one `Product`, not an `Event` — capacity now lives entirely on
    the product's own `stock` (see `Event.max_capacity`'s removal), and a
    table-unit product's stock (a ruilbeurs table) is a different number
    from a person-unit product's (a champagne breakfast seat), so a waitlist
    can only ever mean "this specific sold-out thing", never "the event" in
    the abstract. Purely a manually-worked queue for staff to contact people
    from in order — nothing here auto-promotes or auto-notifies.
    """

    __tablename__ = "waitlist_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    product_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    guest_count: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str] = mapped_column(Text, default="")
    client_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    product: Mapped[Product] = relationship()
