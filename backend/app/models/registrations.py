"""Registrations and their table allocations."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
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

from app.db.base import Base
from app.models.base import _utcnow

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


class Registration(Base):
    __tablename__ = "registrations"
    __table_args__ = (
        Index("ix_registrations_person_checked_event", "person_id", "checked_in", "event_id"),
        UniqueConstraint("poll_question_id", "person_id", name="uq_registration_poll_person"),
        CheckConstraint("status IN ('pending', 'confirmed', 'cancelled')", name="ck_registrations_status"),
        CheckConstraint("payment_status IN ('unpaid', 'partial', 'paid')", name="ck_registrations_payment_status"),
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
    order_items: Mapped[list[dict]] = mapped_column(JSON, default=list)
    allocations: Mapped[list[RegistrationAllocation]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="RegistrationAllocation.table_id"
    )
    product_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    notes: Mapped[str] = mapped_column(Text, default="")

    person_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="RESTRICT"), index=True, nullable=False
    )

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
