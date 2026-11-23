"""Registrations and their table allocations."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    select,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.vocabularies import PaymentStatus, RegistrationStatus
from app.db.base import Base
from app.models.base import _utcnow
from app.models.vocabulary import vocabulary_check

if TYPE_CHECKING:
    from app.models.events import Event
    from app.models.orders import RegistrationOrderAnswer
    from app.models.people import Person
    from app.models.tables import Table
    from app.models.users import User


class RegistrationAllocation(Base):
    """Actual guests assigned to one table; whole-table purchases are exclusive."""

    __tablename__ = "registration_allocations"
    registration_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
    )
    table_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("tables.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    guest_count: Mapped[int] = mapped_column(Integer)
    exclusive: Mapped[bool] = mapped_column(Boolean, default=False)
    table: Mapped[Table] = relationship(lazy="joined")
    __table_args__ = (CheckConstraint("guest_count >= 0", name="ck_allocation_guests"),)


class RegistrationOrderLine(Base):
    """A booked product and its immutable labels and unit price."""

    __tablename__ = "registration_order_lines"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_line_quantity"),
        CheckConstraint("included_quantity BETWEEN 0 AND quantity", name="ck_order_line_included"),
        CheckConstraint("delivered_quantity BETWEEN 0 AND quantity", name="ck_order_line_delivered"),
        CheckConstraint("price >= 0", name="ck_order_line_price"),
        CheckConstraint("live_product_id = product_id", name="ck_order_line_product_identity"),
    )

    registration_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Keep the booked identifier even if a product is later deleted.
    product_id: Mapped[str] = mapped_column(Text)
    live_product_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    name_nl: Mapped[str] = mapped_column(Text)
    name_fr: Mapped[str | None] = mapped_column(Text)
    name_en: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[int] = mapped_column(BigInteger)
    included_quantity: Mapped[int] = mapped_column(BigInteger)
    delivered_quantity: Mapped[int] = mapped_column(BigInteger)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    category: Mapped[str] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(Text)
    visible: Mapped[bool] = mapped_column(Boolean)

    def order_item(self) -> dict:
        return {
            "product_id": self.product_id,
            "name": self.name_nl,
            "name_nl": self.name_nl,
            "name_fr": self.name_fr,
            "name_en": self.name_en,
            "quantity": self.quantity,
            "included_quantity": self.included_quantity,
            "delivered_quantity": self.delivered_quantity,
            "delivered": self.delivered_quantity == self.quantity,
            "price": float(self.price),
            "category": self.category,
            "visible": self.visible,
        }


# These fields can be reconstructed from a booked line. Package rules must
# still be frozen because an edit can recalculate quantities from those rules.
LINE_SNAPSHOT_FIELDS = frozenset({"product_id", "name", "name_nl", "name_fr", "name_en", "price", "category", "unit"})


class Registration(Base):
    __tablename__ = "registrations"
    __table_args__ = (
        Index("ix_registrations_person_checked_event", "person_id", "checked_in", "event_id"),
        UniqueConstraint("poll_question_id", "person_id", name="uq_registration_poll_person"),
        vocabulary_check("ck_registrations_status", "status", RegistrationStatus),
        vocabulary_check("ck_registrations_payment_status", "payment_status", PaymentStatus),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("events.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    poll_question_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="SET NULL"), index=True
    )
    guest_count: Mapped[int] = mapped_column(Integer)
    order_answers: Mapped[list[RegistrationOrderAnswer]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    order_lines: Mapped[list[RegistrationOrderLine]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by=RegistrationOrderLine.position, passive_deletes=True
    )
    allocations: Mapped[list[RegistrationAllocation]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="RegistrationAllocation.table_id"
    )
    package_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    notes: Mapped[str] = mapped_column(Text, default="")

    person_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    @property
    def order_items(self) -> list[dict]:
        return [line.order_item() for line in self.order_lines]

    @property
    def booked_table_quantity(self) -> int:
        return sum(line.quantity for line in self.order_lines if line.unit == "table")

    def frozen_product_graph(self) -> dict:
        lines = {line.product_id: line for line in self.order_lines}
        graph = {}
        for key, rules in (self.package_snapshot or {}).items():
            if line := lines.get(key):
                item = line.order_item()
                item["unit"] = line.unit
                item["price"] = str(line.price)
                rules = {**{field: item[field] for field in LINE_SNAPSHOT_FIELDS}, **rules}
            graph[key] = rules
        return graph

    def replace_order(self, items: list[dict], snapshot: dict, live_product_ids: set[str]) -> None:
        if self.order_items != items:
            self.updated_at = _utcnow()
        booked_ids = {item["product_id"] for item in items}
        self.package_snapshot = {
            key: {
                field: value
                for field, value in node.items()
                if key not in booked_ids or field not in LINE_SNAPSHOT_FIELDS
            }
            for key, node in snapshot.items()
        }
        # Reuse rows at the same position so exchanging products does not
        # require deleting and reinserting rows with an identical primary key.
        for position, item in enumerate(items):
            line = (
                self.order_lines[position]
                if position < len(self.order_lines)
                else RegistrationOrderLine(position=position)
            )
            key = item["product_id"]
            line.product_id = key
            line.live_product_id = key if key in live_product_ids else None
            line.name_nl = item["name_nl"] or item["name"]
            line.name_fr = item["name_fr"]
            line.name_en = item["name_en"]
            line.quantity = item["quantity"]
            line.included_quantity = item["included_quantity"]
            line.delivered_quantity = item["delivered_quantity"]
            line.price = Decimal(str(item["price"]))
            line.category = item["category"]
            line.unit = snapshot[key]["unit"]
            line.visible = item["visible"]
            if position == len(self.order_lines):
                self.order_lines.append(line)
        del self.order_lines[len(items) :]

    @hybrid_property
    def table_id(self) -> str | None:
        """First allocated table for compact displays, derived from allocations."""
        return self.allocations[0].table_id if self.allocations else None

    @table_id.inplace.expression
    @classmethod
    def _table_expression(cls):
        return (
            select(RegistrationAllocation.table_id)
            .where(RegistrationAllocation.registration_id == cls.id)
            .order_by(RegistrationAllocation.table_id)
            .limit(1)
            .correlate_except(RegistrationAllocation)
            .scalar_subquery()
        )

    user_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    """FK to the portal User who owns this booking (filled when a visitor claims it)."""

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    """pending | confirmed | cancelled"""

    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    """unpaid | partial | paid"""

    amount_due: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    """What this booking owes, in euro — e.g. a bourse table rental fee.

    Recorded by an admin and settled offline; the platform tracks the figure and
    `payment_status`, it does not take payments. Null means nothing is owed.
    """

    # Keep the legacy database column in sync for older deployments until its migration.
    _legacy_checked_in: Mapped[bool] = mapped_column("checked_in", Boolean, default=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    strap_issued: Mapped[bool] = mapped_column(Boolean, default=False)
    check_in_token: Mapped[str] = mapped_column(String(64), unique=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    event: Mapped[Event] = relationship(back_populates="registrations")
    person: Mapped[Person] = relationship(back_populates="registrations")
    user: Mapped[User | None] = relationship(back_populates="registrations")

    @property
    def checked_in(self) -> bool:
        return self.checked_in_at is not None
