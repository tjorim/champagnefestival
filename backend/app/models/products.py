"""Products."""

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
    Integer,
    Numeric,
    String,
    func,
    select,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.core.translations import resolve_text
from app.core.vocabularies import ProductUnit
from app.db.base import Base
from app.models.base import _optional_dutch_check, _utcnow
from app.models.registrations import Registration, RegistrationOrderLine
from app.models.vocabulary import vocabulary_check

if TYPE_CHECKING:
    from app.models.events import Event


class Product(Base):
    """Something guests can order when registering for a specific event
    (a bottle of champagne, a cheese platter, ...). Scoped to one event —
    products are not a reusable catalog, since what a VIP tasting sells has
    nothing to do with what a different tasting or a bourse would.

    The registration flow copies `name`/`price`/`category` onto the
    registration's `order_items` at order time, so archiving or deleting a
    product afterward does not alter orders already placed against it.
    """

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("events.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reserved_quantity: Mapped[int] = column_property(
        select(func.coalesce(func.sum(RegistrationOrderLine.quantity), 0))
        .join(Registration, Registration.id == RegistrationOrderLine.registration_id)
        .where(
            Registration.event_id == event_id,
            Registration.status != "cancelled",
            RegistrationOrderLine.live_product_id == id,
        )
        .correlate_except(Registration, RegistrationOrderLine)
        .scalar_subquery()
    )

    name_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    name_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(String(300), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(300), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(300), nullable=True)
    """Short, optional blurb shown alongside the product name; per language like
    the name, with Dutch required whenever there is any text."""
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    category: Mapped[str] = mapped_column(
        String(50), ForeignKey("product_categories.key", ondelete="RESTRICT"), index=True
    )
    """Key of a `ProductCategory`; copied onto the order lines made from this product."""
    unit: Mapped[str] = mapped_column(String(10), default="item")
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)
    inclusions: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    """Included product, numerator/denominator and rounding per parent quantity
    (or per booked guest when an edge's `basis` is `guests`).
    Always counts toward stock/preparation totals. Whether an inclusion line
    reaches the visitor-facing order summary is decided entirely by the
    included product's own `purchasable` flag (see below) — there is no
    separate per-inclusion visibility switch.

    An empty list means no included products.
    """
    __table_args__ = (
        CheckConstraint("stock IS NULL OR stock >= 0", name="ck_product_stock"),
        vocabulary_check("ck_product_unit", "unit", ProductUnit),
        CheckConstraint("NOT required OR purchasable", name="ck_products_required_implies_purchasable"),
        CheckConstraint("(length(trim(name_nl)) > 0) IS TRUE", name="ck_products_name_nl"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_products_description_nl"),
    )

    purchasable: Mapped[bool] = mapped_column(Boolean, default=True)
    """Whether this product can be ordered standalone and is ever named to a
    visitor — see #1020. A `purchasable=False` ("hidden") product can still be
    an inclusion target of another product (bundled quantity, stock and
    preparation totals are unaffected either way), but it is never orderable
    directly, never shown to a visitor as a standalone option, and never named
    in a package's visitor-facing summary line — only its own purchasable
    inclusion targets ever appear there. There is no separate "disabled" state:
    a hidden product can always be newly bundled, and a no-longer-offered
    product is simply set to `purchasable=False` rather than deleted.
    """
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    """A prerequisite product for this event (e.g. an entry ticket). An order
    that includes any non-required product for an event with required products
    must also include at least one required one — see
    app.services.registrations_service.resolve_order_items. A required product
    must be purchasable (`ck_products_required_implies_purchasable`) — a
    hidden product can never be the thing an order is required to contain."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    event: Mapped[Event] = relationship(back_populates="products")

    @property
    def name(self) -> str:
        """Dutch name: what admin lists, exports and audit entries show.
        Visitors get ``localized_name``. Read-only: write ``name_nl/fr/en``."""
        return self.localized_name(None)

    @property
    def description(self) -> str:
        """Dutch description, ``""`` when there is none."""
        return self.localized_description(None)

    def localized_name(self, locale: str | None) -> str:
        return resolve_text({"nl": self.name_nl, "fr": self.name_fr, "en": self.name_en}, locale)

    def localized_description(self, locale: str | None) -> str:
        return resolve_text({"nl": self.description_nl, "fr": self.description_fr, "en": self.description_en}, locale)
