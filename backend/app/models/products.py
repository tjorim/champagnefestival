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
    cast,
    func,
    select,
    true,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.core.translations import resolve_text
from app.db.base import Base
from app.db.dialect_functions import json_array_elements
from app.models.base import _optional_dutch_check, _utcnow
from app.models.registrations import Registration

if TYPE_CHECKING:
    from app.models.events import Event


_product_lines = json_array_elements(Registration.order_items).table_valued("value").alias("product_line")


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
        select(func.coalesce(func.sum(cast(_product_lines.c.value.op("->>")("quantity"), Integer)), 0))
        .select_from(Registration.__table__.join(_product_lines, true()))
        .where(
            Registration.event_id == event_id,
            Registration.status != "cancelled",
            _product_lines.c.value.op("->>")("product_id") == id,
        )
        .correlate_except(Registration, _product_lines)
        .scalar_subquery()
    )

    name_nl: Mapped[str | None] = mapped_column(String(200), nullable=True)
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
    inclusions: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    """Included product, numerator/denominator and rounding per parent quantity.
    Always counts toward stock/preparation totals. Whether an inclusion line
    reaches the visitor-facing order summary is decided entirely by the
    included product's own `purchasable` flag (see below) — there is no
    separate per-inclusion visibility switch.

    Null retains the legacy single inclusion until an administrator edits it.
    An explicit empty list means no included products.
    """
    __table_args__ = (
        CheckConstraint("stock IS NULL OR stock >= 0", name="ck_product_stock"),
        CheckConstraint("unit IN ('item', 'table', 'person')", name="ck_product_unit"),
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
    included_product_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    included_per_guests: Mapped[int | None] = mapped_column(Integer, nullable=True)
    """Together, these bundle a free quantity of another product on this event
    into this one — a VIP table might include one champagne bottle per two
    guests. `included_per_guests` is only meaningful alongside
    `included_product_id`; both or neither are set (see ProductCreate/Update).
    Deleting the included product clears the link (ON DELETE SET NULL) rather
    than blocking the delete or cascading into an unrelated product."""

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
