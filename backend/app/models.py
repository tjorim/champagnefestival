"""SQLAlchemy ORM models."""

import json
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50))
    event_id: Mapped[str] = mapped_column(String(100))
    event_title: Mapped[str] = mapped_column(String(200))
    guest_count: Mapped[int] = mapped_column(Integer)
    # JSON-encoded list of OrderItem dicts
    pre_orders: Mapped[str] = mapped_column(Text, default="[]")
    notes: Mapped[str] = mapped_column(Text, default="")
    table_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pending")
    """pending | confirmed | cancelled"""

    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    """unpaid | partial | paid"""

    checked_in: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    strap_issued: Mapped[bool] = mapped_column(Boolean, default=False)
    check_in_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_pre_orders(self) -> list[dict]:
        return json.loads(self.pre_orders) if self.pre_orders else []

    def set_pre_orders(self, items: list[dict]) -> None:
        self.pre_orders = json.dumps(items)


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    capacity: Mapped[int] = mapped_column(Integer)
    # Position as percentage of hall dimensions (0–100)
    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    # JSON-encoded list of reservation ID strings
    reservation_ids: Mapped[str] = mapped_column(Text, default="[]")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def get_reservation_ids(self) -> list[str]:
        return json.loads(self.reservation_ids) if self.reservation_ids else []

    def set_reservation_ids(self, ids: list[str]) -> None:
        self.reservation_ids = json.dumps(ids)
