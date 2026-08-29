"""SQLAlchemy ORM models."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    """An authenticated portal user, auto-provisioned on first OIDC login."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    oidc_subject: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    """OIDC ``sub`` claim — stable identifier from the identity provider."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(back_populates="user")
    pebble_access_token: Mapped[PebbleAccessToken | None] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )


class PebbleAccessToken(Base):
    """Long-lived, revocable credential scoped to the Pebble registration glance."""

    __tablename__ = "pebble_access_tokens"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="pebble_access_token")


class Registration(Base):
    __tablename__ = "registrations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("events.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    guest_count: Mapped[int] = mapped_column(Integer)
    order_items: Mapped[list[dict]] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    accessibility_note: Mapped[str] = mapped_column(Text, default="")
    """Optional accessibility requirements for the guest (wheelchair, low table, etc.)."""

    person_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    table_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("tables.id", ondelete="SET NULL"), index=True, nullable=True
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

    checked_in: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    strap_issued: Mapped[bool] = mapped_column(Boolean, default=False)
    check_in_token: Mapped[str] = mapped_column(String(64), unique=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    event: Mapped[Event] = relationship(back_populates="registrations")
    person: Mapped[Person] = relationship(back_populates="registrations")
    user: Mapped[User | None] = relationship(back_populates="registrations")


class ReservationAccessToken(Base):
    """Short-lived visitor access token for viewing registrations via e-mail link."""

    __tablename__ = "reservation_access_tokens"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ContactMessage(Base):
    """A public contact submission retained independently of e-mail delivery."""

    __tablename__ = "contact_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    client_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Exhibitor(Base):
    """A unified exhibitor: champagne producer, sponsor, or vendor."""

    __tablename__ = "exhibitors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    image: Mapped[str] = mapped_column(String(500), default="")
    website: Mapped[str] = mapped_column(String(500), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    type: Mapped[str] = mapped_column(String(20), default="vendor")
    """'producer' | 'sponsor' | 'vendor'"""
    contact_person_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("people.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Venue(Base):
    """A physical venue where the festival takes place."""

    __tablename__ = "venues"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    postal_code: Mapped[str] = mapped_column(String(20), default="")
    country: Mapped[str] = mapped_column(String(100), default="")
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Room(Base):
    """A physical space within a venue.

    Width and length are stored in metres so the frontend can render a
    proportional canvas.
    """

    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    venue_id: Mapped[str] = mapped_column(String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)
    """FK to the Venue this room belongs to."""

    width_m: Mapped[float] = mapped_column(default=20.0)
    """Room width in metres — used to render a proportional canvas.

    The ``default=20.0`` here is a Python-side convenience for ORM callers
    (e.g. test fixtures) that construct a ``Room`` directly; the REST/MCP API
    requires an explicit value (see ``RoomCreate`` and #835) and the DB-level
    ``server_default`` was dropped in migration 010 so a raw insert can no
    longer silently resurrect it.
    """

    length_m: Mapped[float] = mapped_column(default=15.0)
    """Room length in metres. See ``width_m`` for the default-value caveat."""

    color: Mapped[str] = mapped_column(String(20), default="#6c757d")
    """Accent colour for the room badge / canvas border (CSS colour string)."""

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    dimensions_placeholder: Mapped[bool] = mapped_column(Boolean, default=False)
    """True when width_m/length_m are a placeholder rather than a measured value.

    Set by migration 010 for rooms that got the old silent 20x15 default before
    dimensions became a required field (#835), and cleared automatically the
    next time width_m/length_m is explicitly updated (see rooms_service.update_room).
    """

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Layout(Base):
    """A named floor-plan snapshot for a specific room and edition day index.

    Each snapshot captures the table configuration for one room on a numbered
    day within an edition, allowing managers to maintain different floor plans
    per day and restore previous versions.
    """

    __tablename__ = "layouts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="SET NULL"), nullable=True
    )
    room_id: Mapped[str] = mapped_column(String(64), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    """FK to the room this layout belongs to."""

    day_id: Mapped[int] = mapped_column(Integer)
    """1-based day index within the edition."""

    label: Mapped[str] = mapped_column(String(200), default="")
    """Human-readable version label, e.g. 'pre-event', 'after cancellations'."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    room: Mapped[Room] = relationship()
    tables: Mapped[list[Table]] = relationship(order_by="Table.created_at, Table.id")
    areas: Mapped[list[Area]] = relationship(order_by="Area.created_at, Area.id")


class TableType(Base):
    """Physical template for a table (shape, dimensions, height, max seats), owned by a venue.

    Scoped like Room (see #858) rather than shared across venues — an organizer's
    physical tables belong to wherever they're actually stored, not a global catalog.
    """

    __tablename__ = "table_types"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    venue_id: Mapped[str] = mapped_column(String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)
    """FK to the Venue this table type belongs to."""

    shape: Mapped[str] = mapped_column(String(20), default="rectangle")
    """'rectangle' | 'round'"""
    width_m: Mapped[float] = mapped_column(default=0.7)
    """Width in metres (diameter for round tables)."""
    length_m: Mapped[float] = mapped_column(default=1.8)
    """Length in metres (equals width_m for round tables)."""
    height_type: Mapped[str] = mapped_column(String(20), default="low")
    """'low' | 'high'"""
    max_capacity: Mapped[int] = mapped_column(Integer)
    """Physical maximum number of seats for this table shape/size."""
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    capacity: Mapped[int] = mapped_column(Integer)

    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    """Position as a percentage [0, 100] of the layout's *rendered canvas*, not the
    room's raw ``width_m``/``length_m`` — origin top-left, anchored at this table's
    own top-left corner. See ``docs/floor-plan-coordinates.md`` for the full contract
    (including why the canvas isn't a 1:1 percentage of physical room size for small
    rooms) shared with ``Area.x``/``Area.y`` and the frontend editor.
    """

    table_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("table_types.id", ondelete="RESTRICT"), nullable=False
    )
    """FK to the TableType template that defines this table's shape and dimensions."""

    rotation: Mapped[int] = mapped_column(Integer, default=0)
    """Rotation angle in whole degrees [0, 359], clockwise, pivoting around this
    table's own center. See ``docs/floor-plan-coordinates.md``.
    """

    layout_id: Mapped[str] = mapped_column(String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    """FK to the Layout this table belongs to."""

    reservation_ids: Mapped[list[str]] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Area(Base):
    """A non-seating zone on the floor plan (stand, stage, catering, etc.)."""

    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    layout_id: Mapped[str] = mapped_column(String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    exhibitor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("exhibitors.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(200))
    icon: Mapped[str] = mapped_column(String(50), default="bi-shop")
    """Bootstrap Icons class name, e.g. 'bi-shop', 'bi-music-note-beamed'."""

    x: Mapped[float] = mapped_column(default=50.0)
    y: Mapped[float] = mapped_column(default=50.0)
    """Position as a percentage [0, 100] of the layout's rendered canvas. Same
    contract as ``Table.x``/``Table.y`` — see ``docs/floor-plan-coordinates.md``.
    """

    rotation: Mapped[int] = mapped_column(Integer, default=0)
    """Rotation angle in whole degrees [0, 359], clockwise, pivoting around this
    area's own center. Same contract as ``Table.rotation``.
    """

    width_m: Mapped[float] = mapped_column(default=1.5)
    length_m: Mapped[float] = mapped_column(default=1.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Edition(Base):
    """A festival edition or related standalone event container."""

    __tablename__ = "editions"
    __table_args__ = (
        Index(
            "uq_editions_active_type",
            "edition_type",
            unique=True,
            postgresql_where=text("active = true"),
        ),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    """Slug-style identifier, e.g. '2026-march'."""

    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[str] = mapped_column(String(20))

    venue_id: Mapped[str] = mapped_column(String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)
    edition_type: Mapped[str] = mapped_column(String(20), default="festival")
    exhibitors: Mapped[list[int]] = mapped_column(JSON, default=list)
    """The festival lineup — producers and sponsors programmed for this edition."""

    co_organizer_exhibitor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("exhibitors.id", ondelete="SET NULL"), nullable=True
    )
    """The exhibitor co-organizing this edition with the vzw, if any.

    Deliberately separate from `exhibitors`: co-organizing is a different
    relationship from being in the lineup, and it applies to editions (such as a
    bourse) that carry no lineup at all. The vzw remains the organizer either way.
    """

    active: Mapped[bool] = mapped_column(Boolean, default=True)
    """At most one edition per `edition_type` may be active at a time — enforced by the
    `uq_editions_active_type` partial unique index (migration 009) and, on the normal
    single-request path, by `app.services.editions_service.deactivate_conflicting_editions`
    transactionally deactivating the previous active edition of the same type. See #832."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    events: Mapped[list[Event]] = relationship(
        back_populates="edition",
        cascade="all, delete-orphan",
        order_by="Event.date, Event.start_time, Event.created_at",
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    date: Mapped[date] = mapped_column(Date, index=True)  # ty: ignore[invalid-type-form]
    start_time: Mapped[str] = mapped_column(String(10))
    end_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    category: Mapped[str] = mapped_column(String(50))
    """Free-text display label for the public schedule (e.g. "tasting", "vip",
    "exchange") — purely cosmetic, does not affect what guests can order.
    Whether this event sells anything is answered by whether it *has*
    products (see `Product`), not by a separate flag on the event."""

    registration_required: Mapped[bool] = mapped_column(Boolean, default=False)
    registrations_open_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    edition: Mapped[Edition] = relationship(back_populates="events")
    registrations: Mapped[list[Registration]] = relationship(back_populates="event")
    products: Mapped[list[Product]] = relationship(back_populates="event", cascade="all, delete-orphan")


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
    name: Mapped[str] = mapped_column(String(200))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    category: Mapped[str] = mapped_column(String(20))
    """"champagne" | "food" | "other" — matches OrderItemCategory."""
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    """A prerequisite product for this event (e.g. an entry ticket). An order
    that includes any non-required product for an event with required products
    must also include at least one required one — see
    app.services.registrations_service.resolve_order_items."""
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


class Person(Base):
    """Unified person entity used for members, volunteers, and visitors."""

    __tablename__ = "people"
    __table_args__ = (
        # Trigram (pg_trgm) GIN indexes backing fuzzy operational search, in
        # addition to the plain btree index=True below on search_email — the
        # migration creates both, since exact-match lookup and fuzzy search
        # need different index shapes on the same column.
        Index(
            "ix_people_search_name_trgm",
            "search_name",
            postgresql_using="gin",
            postgresql_ops={"search_name": "gin_trgm_ops"},
        ),
        Index(
            "ix_people_search_name_alt_trgm",
            "search_name_alt",
            postgresql_using="gin",
            postgresql_ops={"search_name_alt": "gin_trgm_ops"},
        ),
        Index(
            "ix_people_search_email_trgm",
            "search_email",
            postgresql_using="gin",
            postgresql_ops={"search_email": "gin_trgm_ops"},
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), default="")
    search_name: Mapped[str] = mapped_column(String(200), default="")
    """Trigger-maintained unaccented lower-case name for operational lookup."""
    search_name_alt: Mapped[str] = mapped_column(String(200), default="")
    """Trigger-maintained German-transliteration variant for operational lookup."""
    search_email: Mapped[str] = mapped_column(String(200), default="", index=True)
    """Trigger-maintained lower-case email for authorized operational lookup."""
    phone: Mapped[str] = mapped_column(String(50), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)

    national_register_number: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    eid_document_number: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    visits_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    club_name: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(back_populates="person")


class VolunteerPeriod(Base):
    """A volunteering period for a person with the volunteer role."""

    __tablename__ = "volunteer_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    first_help_day: Mapped[date] = mapped_column(Date, nullable=False)
    last_help_day: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class AuditEntry(Base):
    """Immutable audit record for high-impact event-day mutations."""

    __tablename__ = "audit_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(255), index=True)
    """OIDC ``sub`` claim, client IP for token-gated ops, or 'anonymous'."""
    auth_source: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown", index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    integration_client_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    resource_type: Mapped[str] = mapped_column(String(50), index=True)
    resource_id: Mapped[str] = mapped_column(String(64), index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class IdempotencyKey(Base):
    """Replay cache guarding idempotency-key-protected bulk/import writes (#837).

    Scoped by ``scope`` (e.g. ``"rooms.bulk_create"``) so the same
    client-supplied ``key`` can't collide across unrelated operations. A
    retried call with the same (``scope``, ``key``) and an identical request
    body replays ``response_body`` instead of re-executing the write; the same
    key reused with a different body is rejected as a conflict. See
    ``app.services.idempotency``.
    """

    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("scope", "key", name="uq_idempotency_keys_scope_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    """sha256 hex digest of the canonicalised request body — detects the same
    key being reused for a genuinely different request."""
    response_body: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class IntegrationClient(Base):
    """A managed, database-backed credential for machine automation (MCP).

    Unlike Keycloak client-credentials (which remain fully supported), this is
    an operator-issued credential scoped to exactly one Champagnefestival role
    tier — never more privileged than the admin who created it. Only the
    ``key_hash`` is stored; the raw key is shown once at creation/rotation time
    (see ``app.services.integration_clients_service``).
    """

    __tablename__ = "integration_clients"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    key_preview: Mapped[str] = mapped_column(String(8), nullable=False)
    allowed_role: Mapped[str] = mapped_column(String(20), nullable=False)
    """'admin' | 'volunteer' — the single Champagnefestival role tier this credential
    resolves to via ChampagneFestivalMcpBackend._resolve_role(). Fixed at creation;
    never 'public' (a public-only credential has no reason to exist) and never
    more privileged than created_by_actor's own tier at creation time."""
    created_by_actor: Mapped[str] = mapped_column(String(255), nullable=False)
    """OIDC 'sub' claim of the admin who created this credential (audit/ownership)."""
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_limit_window_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rate_limit_window_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AppSettings(Base):
    """Site-wide settings. Always exactly one row, with a fixed id."""

    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class FaqItem(Base):
    """A single question/answer pair shown on the public FAQ section.

    Dutch is required; English/French are optional per item — a blank
    translation hides that item on that locale's public FAQ.
    """

    __tablename__ = "faq_items"
    __table_args__ = (
        # Deferred so a reorder can touch several rows in one transaction
        # without a transient duplicate mid-transaction tripping the check —
        # only the state at commit has to be unique (#836).
        UniqueConstraint("sort_order", name="uq_faq_items_sort_order", deferrable=True, initially="DEFERRED"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question_nl: Mapped[str] = mapped_column(String(500))
    answer_nl: Mapped[str] = mapped_column(Text)
    question_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    answer_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    answer_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
