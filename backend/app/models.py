"""SQLAlchemy ORM models."""

from __future__ import annotations

from datetime import UTC, datetime
from datetime import date as dt_date
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    cast,
    func,
    select,
    text,
    true,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.database import Base
from app.dialect_functions import json_array_elements, trim_spaces
from app.translations import BASE_LANGUAGE, resolve_pair, resolve_text


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _optional_dutch_check(column: str) -> str:
    """SQL that an optional per-language text has Dutch text whenever it has any text at all."""
    return f"(({column}_fr IS NULL AND {column}_en IS NULL) OR length(trim({column}_nl)) > 0) IS TRUE"


class User(Base):
    """One portal account, provisioned on first OIDC login or first redeemed
    emailed magic link (#953 decision 1).

    At least one of ``oidc_subject``/``verified_email`` is set. Keycloak
    accounts are provisioned via OIDC login
    (``app.services.users_service.resolve_oidc_user``); email-only accounts by
    redeeming a magic link (``get_or_create_user_by_email``). Since #1209 a
    Keycloak login whose token carries an explicitly verified email joins the
    matching email-only account (or sets the email itself), so password and
    magic-link sign-in reach the same row, bookings and audit trail; both
    identities set means "linked". Roles are never stored here — Keycloak
    stays authoritative. Both kinds read through the same ``registrations``
    relationship and ``/me`` handlers — see
    ``app.visitor_session.get_current_user``.
    """

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "oidc_subject IS NOT NULL OR verified_email IS NOT NULL",
            name="ck_users_has_identity",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    oidc_subject: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    """OIDC ``sub`` claim — stable identifier from the identity provider. Set
    for every Keycloak-backed account, ``NULL`` for email-only accounts."""
    verified_email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True, nullable=True)
    """Email address proven by redeeming a magic link or attested by Keycloak
    (``email_verified`` true). ``NULL`` for a Keycloak account without one."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(back_populates="user")
    pebble_access_token: Mapped[PebbleAccessToken | None] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    visitor_sessions: Mapped[list[VisitorSession]] = relationship(back_populates="user", cascade="all, delete-orphan")


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

    checked_in: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    strap_issued: Mapped[bool] = mapped_column(Boolean, default=False)
    check_in_token: Mapped[str] = mapped_column(String(64), unique=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    event: Mapped[Event] = relationship(back_populates="registrations")
    person: Mapped[Person] = relationship(back_populates="registrations")
    user: Mapped[User | None] = relationship(back_populates="registrations")


class PaymentTransaction(Base):
    """Append-only ledger entry for money that moved on one booking (#1019).

    There is no ``kind`` column — a positive ``amount`` is a payment, a
    negative one is a refund, and that sign is the only distinction the
    system needs, so it's derived wherever a label is shown rather than
    stored redundantly. A refund never rewrites a prior payment — it's a
    new, separate row, optionally linked via ``reversed_transaction_id`` to
    the entry it reverses. ``Registration.amount_paid``/``payment_status``
    stay real, synced columns rather than becoming computed properties:
    every append recomputes and stores them (see
    ``app.services.payments_service.sync_registration_payment_fields``) so
    every existing reader — SQL filters/sorts on ``payment_status``,
    ``registration_to_dict``, CSV exports, edition stats — keeps working
    unchanged; only the write path moves off direct mutation.
    """

    __tablename__ = "payment_transactions"
    __table_args__ = (CheckConstraint("amount <> 0", name="ck_payment_transactions_amount_nonzero"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    registration_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("registrations.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    """Signed EUR amount: positive for a payment, negative for a refund."""
    effective_date: Mapped[dt_date] = mapped_column(Date, nullable=False)
    """When the money actually moved (e.g. a bank-transfer date), which may
    predate when this entry is recorded."""
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    recorded_by: Mapped[str] = mapped_column(String(255), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reversed_transaction_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("payment_transactions.id", ondelete="SET NULL"), nullable=True
    )

    registration: Mapped[Registration] = relationship()


class VisitorMagicLink(Base):
    """Short-lived, single-use passwordless sign-in credential (#953 decision 2).

    One outstanding link per email, hashed token, TTL. Redeeming it
    establishes a persistent ``VisitorSession``. 30-minute TTL
    (``settings.guest_access_token_ttl_minutes``). Previously shared its shape
    with the now-removed ``ReservationAccessToken`` (a one-shot, session-less
    "claim any email you can prove control of" credential, retired in #1044 —
    see docs/decisions/1044-confirm-first-registration-claiming.md); this is
    the only surviving emailed credential of that shape.
    """

    __tablename__ = "visitor_magic_links"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class VisitorSession(Base):
    """Persistent passwordless session established by redeeming a magic link
    (#953 decision 3).

    Database-backed, not a stateless JWT: the opaque ``HttpOnly`` cookie value
    is this row's ``id``, looked up by its hash (``session_hash``) rather than
    the raw ID, mirroring how ``token_hash`` columns above never store a
    credential in cleartext. ``last_seen_at``/``expires_at`` implement the
    confirmed 7-day sliding idle window; ``hard_expires_at`` is the 30-day cap
    that activity can never extend — see
    ``app.visitor_session.SESSION_IDLE_TIMEOUT``/``SESSION_HARD_CAP``.
    """

    __tablename__ = "visitor_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    hard_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="visitor_sessions")


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


class OutboxJob(Base):
    """Durable, lease-claimed work item for one external side effect."""

    __tablename__ = "outbox_jobs"
    __table_args__ = (UniqueConstraint("deduplication_key", name="uq_outbox_jobs_deduplication_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_type: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    deduplication_key: Mapped[str] = mapped_column(String(200), nullable=False)
    state: Mapped[str] = mapped_column(String(20), default="pending", index=True, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claim_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DeliveryAttempt(Base):
    """Non-secret operational result for one outbox delivery attempt."""

    __tablename__ = "delivery_attempts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("outbox_jobs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PushSubscription(Base):
    """An anonymous, device-scoped Web Push subscription (#941).

    Deliberately not linked to ``User``: subscriptions are public and
    anonymous by design (docs/decisions/941-web-push-foundation.md — "
    administrator-only" describes who can trigger a send via
    ``POST /api/push/test``, not who can subscribe), and are inherently
    tied to one browser/device endpoint, not an account. ``endpoint`` is
    the natural key browsers use to resubscribe; a resubscribe with the
    same endpoint upserts this row rather than creating a duplicate.
    """

    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    endpoint: Mapped[str] = mapped_column(String(600), unique=True, index=True)
    p256dh_key: Mapped[str] = mapped_column(String(200))
    auth_key: Mapped[str] = mapped_column(String(50))
    locale: Mapped[str] = mapped_column(String(2))
    categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Free-form category tags this subscription opted into (e.g.
    ``["system_test"]``). Not a fixed enum — #941 only ever emits
    "system_test" itself. The composer currently targets all subscribers;
    category-based targeting is not implemented."""
    event_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Specific Event ids this subscription wants event-scoped notifications
    for; empty means general/non-event-specific only. Validated against
    real Event rows at subscribe time, not DB-FK-enforced (a deleted event
    should not break an otherwise-valid subscription)."""
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class Organization(Base):
    """A unified organization: champagne producer, sponsor, or vendor."""

    __tablename__ = "organizations"

    __table_args__ = (CheckConstraint(_optional_dutch_check("description"), name="ck_organizations_description_nl"),)

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

    description_nl: Mapped[str | None] = mapped_column(String(600), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(600), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(600), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class OrganizationChange(Base):
    """Private proposal history; the partial unique index permits one pending proposal."""

    __tablename__ = "organization_changes"
    __table_args__ = (
        Index(
            "uq_organization_pending_change",
            "organization_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'superseded', 'replaced')",
            name="ck_organization_change_status",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    submitted_by: Mapped[str] = mapped_column(String(255))
    submitted_auth_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    submitted_values: Mapped[dict] = mapped_column(JSON)
    proposed: Mapped[dict] = mapped_column(JSON)
    superseded_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    notification_recipient: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


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
    """A room arrangement for one event; edition and date derive from that event."""

    __tablename__ = "layouts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), ForeignKey("events.id", ondelete="RESTRICT"), index=True)
    room_id: Mapped[str] = mapped_column(String(64), ForeignKey("rooms.id", ondelete="CASCADE"))
    event: Mapped[Event] = relationship(lazy="joined")
    __table_args__ = (UniqueConstraint("room_id", "event_id", name="uq_layout_room_event"),)

    @hybrid_property
    def edition_id(self) -> str:
        return self.event.edition_id

    @edition_id.inplace.expression
    @classmethod
    def _edition_expression(cls):
        return select(Event.edition_id).where(Event.id == cls.event_id).correlate_except(Event).scalar_subquery()

    label: Mapped[str] = mapped_column(String(200), default="")
    """Human-readable version label, e.g. 'pre-event', 'after cancellations'."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    room: Mapped[Room] = relationship()
    tables: Mapped[list[Table]] = relationship(order_by="Table.created_at, Table.id")
    areas: Mapped[list[Area]] = relationship(order_by="Area.created_at, Area.id")
    # passive_deletes="all": layout_revisions.layout_id is NOT NULL with
    # ON DELETE CASCADE at the DB level (see the migration). Without this,
    # SQLAlchemy's default delete handling would try to load every revision
    # and null out its layout_id before issuing the DELETE, which fails
    # against a NOT NULL column — defer entirely to the DB's own cascade.
    revisions: Mapped[list[LayoutRevision]] = relationship(
        order_by="LayoutRevision.revision_number", passive_deletes="all"
    )


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
    capacity: Mapped[int] = mapped_column(Integer)
    """Intended soft seating limit for every table of this type."""
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
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
    capacity: Mapped[int] = column_property(
        select(TableType.capacity).where(TableType.id == table_type_id).scalar_subquery()
    )
    """Read-only projection of the table type's capacity limit."""

    rotation: Mapped[int] = mapped_column(Integer, default=0)
    """Rotation angle in whole degrees [0, 359], clockwise, pivoting around this
    table's own center. See ``docs/floor-plan-coordinates.md``.
    """

    layout_id: Mapped[str] = mapped_column(String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    """FK to the Layout this table belongs to."""

    event_id: Mapped[str] = column_property(
        select(Layout.event_id).where(Layout.id == layout_id).correlate_except(Layout).scalar_subquery()
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Area(Base):
    """A non-seating zone on the floor plan (stand, stage, catering, etc.)."""

    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    layout_id: Mapped[str] = mapped_column(String(64), ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(200))
    icon: Mapped[str] = mapped_column(String(50), default="bi-shop")
    """Stored icon identifier, e.g. 'bi-shop', 'bi-music-note-beamed'. The ``bi-`` names
    predate the move to Lucide and stay as persisted keys; the frontend maps each to a
    Lucide icon (``AreaIcon``)."""

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


class LayoutRevision(Base):
    """An immutable, named geometry snapshot of one ``Layout`` (#1021).

    Follows the ``PolicyVersion`` numbering pattern: ``revision_number``
    increases per ``layout_id`` under a row lock on the parent ``Layout``
    (see ``app.services.layouts_service.save_layout_revision``), and a row
    here is never mutated or deleted once written — restoring an old
    revision applies its snapshot back onto the live ``Layout``/``Table``/
    ``Area`` rows rather than resurrecting this row. ``snapshot`` captures
    each table/area's stable ``id`` plus geometry (matching the ``id`` is
    what lets compare/restore align objects across a rename — see
    ``LayoutRevisionSnapshot``); it deliberately excludes allocations
    (``organization_id``, registration links), which remain live operational
    data outside any revision's scope.
    """

    __tablename__ = "layout_revisions"
    __table_args__ = (UniqueConstraint("layout_id", "revision_number", name="uq_layout_revisions_number"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    layout_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("layouts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(200), default="")
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)


class Edition(Base):
    """A festival edition or related standalone event container."""

    __tablename__ = "editions"
    __table_args__ = (
        Index(
            "uq_editions_active_type",
            "edition_type",
            unique=True,
            postgresql_where=text("active = true"),
            sqlite_where=text("active = true"),
        ),
        CheckConstraint("edition_type IN ('festival', 'bourse', 'capsule_exchange')", name="ck_editions_edition_type"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    """Slug-style identifier, e.g. '2026-march'."""

    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[str] = mapped_column(String(20))

    venue_id: Mapped[str] = mapped_column(String(64), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)
    edition_type: Mapped[str] = mapped_column(String(20), default="festival")
    lineup: Mapped[list[EditionOrganization]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="EditionOrganization.position",
    )
    """The festival lineup — producers and sponsors programmed for this edition, in the
    admin-defined order (kept: sponsors appear on the public site in this order within their
    tier, #1226). Sponsorship is per edition, so a sponsor's level lives on its lineup row
    rather than on the organization. Read and written through `organizations` and
    `sponsor_tiers`; see `app.services.editions_service`."""

    @property
    def organizations(self) -> list[int]:
        return [entry.organization_id for entry in self.lineup]

    @organizations.setter
    def organizations(self, organization_ids: list[int]) -> None:
        existing = {entry.organization_id: entry for entry in self.lineup}
        entries = []
        for position, organization_id in enumerate(dict.fromkeys(organization_ids)):
            entry = existing.get(organization_id) or EditionOrganization(organization_id=organization_id)
            entry.position = position
            entries.append(entry)
        self.lineup = entries

    @property
    def sponsor_tiers(self) -> dict[str, str]:
        """Sponsor level per lineup organization, ``{organization id (string): "main" | "partner" |
        "supporter"}``. Set `organizations` first: only lineup members can hold a level."""
        return {str(entry.organization_id): entry.sponsor_tier for entry in self.lineup if entry.sponsor_tier}

    @sponsor_tiers.setter
    def sponsor_tiers(self, tiers: dict[str, str]) -> None:
        for entry in self.lineup:
            entry.sponsor_tier = tiers.get(str(entry.organization_id))

    co_organizer_organization_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    """The organization co-organizing this edition with the vzw, if any.

    Deliberately separate from `organizations`: co-organizing is a different
    relationship from being in the lineup, and it applies to editions (such as a
    bourse) that carry no lineup at all. The vzw remains the organizer either way.
    """

    active: Mapped[bool] = mapped_column(Boolean, default=True)
    """At most one edition per `edition_type` may be active at a time — enforced by the
    `uq_editions_active_type` partial unique index (migration 009) and, on the normal
    single-request path, by `app.services.editions_service.deactivate_conflicting_editions`
    transactionally deactivating the previous active edition of the same type. See #832."""

    flyer_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hero_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    share_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    """Optional admin-uploaded artwork (#1224): the flyer shown on the maintenance
    page, the wide hero photo and the 1200x630 sharing image (`og:image`, JSON-LD).
    Each holds a managed `/uploads/editions/<uuid>-<sha256>.jpg` path written only
    by `app.services.edition_artwork`; `None` falls back to the static site images."""

    scratchpad: Mapped[str] = mapped_column(Text, default="")
    """A free-text, deliberately unstructured planning notepad for this edition
    — reminders, ideas, anything an admin wants written down. Admin-only,
    never exposed through the public edition endpoints (``EditionPublicOut``
    excludes it) or the admin `EditionOut` list/detail shape; read/written
    only through the dedicated ``GET``/``PUT /api/editions/{id}/scratchpad``
    endpoints, so scratchpad edits don't force a refetch of the much heavier
    full edition payload."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    events: Mapped[list[Event]] = relationship(
        back_populates="edition",
        cascade="all, delete-orphan",
        order_by="Event.date, Event.start_time, Event.created_at",
    )


class EditionOrganization(Base):
    """One organization in an edition's lineup (see `Edition.lineup`)."""

    __tablename__ = "edition_organizations"
    __table_args__ = (
        CheckConstraint(
            "sponsor_tier IS NULL OR sponsor_tier IN ('main', 'partner', 'supporter')",
            name="ck_edition_organizations_sponsor_tier",
        ),
    )

    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), primary_key=True
    )
    organization_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    sponsor_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)


class _CategoryColumns:
    """Columns shared by the admin-managed category tables: a stable key (what
    the events or products store) plus its label in each language, following the
    organisation description pattern — Dutch must have text, the
    others are optional and fall back to it. The key is immutable; a category
    that is still in use cannot be deleted."""

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    label_nl: Mapped[str | None] = mapped_column(String(100), nullable=True)
    label_fr: Mapped[str | None] = mapped_column(String(100), nullable=True)
    label_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_label(self, locale: str | None) -> str:
        return resolve_text({"nl": self.label_nl, "fr": self.label_fr, "en": self.label_en}, locale)


def _category_label_check(table: str) -> CheckConstraint:
    return CheckConstraint("(length(trim(label_nl)) > 0) IS TRUE", name=f"ck_{table}_label_nl")


class EventCategory(_CategoryColumns, Base):
    """A category of events, shown as a translated label on the public schedule."""

    __tablename__ = "event_categories"
    __table_args__ = (_category_label_check("event_categories"),)


class ProductCategory(_CategoryColumns, Base):
    """A category of products. The key is what products and the order lines
    copied from them store; delivery tracking treats ``champagne`` specially."""

    __tablename__ = "product_categories"
    __table_args__ = (_category_label_check("product_categories"),)


class Event(Base):
    __tablename__ = "events"

    __table_args__ = (
        CheckConstraint("(length(trim(title_nl)) > 0) IS TRUE", name="ck_events_title_nl"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_events_description_nl"),
        CheckConstraint("NOT (volunteers_only AND members_only)", name="ck_events_single_audience"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title_nl: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_en: Mapped[str | None] = mapped_column(Text, nullable=True)

    @hybrid_property
    def title(self) -> str:
        """Dutch title: what admin lists, audit entries and exports show.
        Visitors get ``localized_title`` instead. Read-only: write ``title_nl/fr/en``."""
        return self.title_nl or ""

    @title.inplace.expression
    @classmethod
    def _title_expression(cls):
        return func.coalesce(cls.title_nl, "")

    @hybrid_property
    def description(self) -> str:
        """Dutch description, ``""`` when there is none (see ``title``)."""
        return self.description_nl or ""

    @description.inplace.expression
    @classmethod
    def _description_expression(cls):
        return func.coalesce(cls.description_nl, "")

    def localized_title(self, locale: str | None) -> str:
        return resolve_text({"nl": self.title_nl, "fr": self.title_fr, "en": self.title_en}, locale)

    def localized_description(self, locale: str | None) -> str:
        return resolve_text({"nl": self.description_nl, "fr": self.description_fr, "en": self.description_en}, locale)

    date: Mapped[dt_date] = mapped_column(Date, index=True)
    start_time: Mapped[str] = mapped_column(String(10))
    end_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    category: Mapped[str] = mapped_column(
        String(50), ForeignKey("event_categories.key", ondelete="RESTRICT"), index=True
    )
    """Key of an `EventCategory`, shown as a translated label on the public
    schedule — purely cosmetic, does not affect what guests can order. Whether
    this event sells anything is answered by whether it *has* products (see
    `Product`), not by a separate flag on the event."""

    order_questions: Mapped[list[EventOrderQuestion]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="EventOrderQuestion.sort_order, EventOrderQuestion.id"
    )

    volunteers_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    members_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    registration_required: Mapped[bool] = mapped_column(Boolean, default=False)
    registrations_open_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    registrations_close_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    edition: Mapped[Edition] = relationship(back_populates="events")
    registrations: Mapped[list[Registration]] = relationship(back_populates="event")
    products: Mapped[list[Product]] = relationship(back_populates="event", cascade="all, delete-orphan")


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


class Person(Base):
    """Unified person entity used for members, volunteers, and visitors."""

    __tablename__ = "people"
    __table_args__ = (
        CheckConstraint(
            "preferred_language IS NULL OR preferred_language IN ('nl', 'fr', 'en')",
            name="ck_people_preferred_language",
        ),
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
        # One composite btree per sortable column of the paged people lists
        # (app.services.people_listing), each ending in the id tiebreak so the
        # index serves the full ORDER BY in either direction. Name and email
        # sort on the normalised search_* columns. (search_email is also
        # covered on its own by the plain index above.)
        Index("ix_people_search_name_id", "search_name", "id"),
        Index("ix_people_search_email_id", "search_email", "id"),
        Index("ix_people_created_at_id", "created_at", "id"),
        Index("ix_people_updated_at_id", "updated_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), default="")
    preferred_language: Mapped[str | None] = mapped_column(String(2), nullable=True)
    search_name: Mapped[str] = mapped_column(String(200), default="")
    """Trigger-maintained unaccented lower-case name for operational lookup."""
    search_name_alt: Mapped[str] = mapped_column(String(200), default="")
    """Trigger-maintained German-transliteration variant for operational lookup."""
    search_email: Mapped[str] = mapped_column(String(200), default="", index=True)
    """Trigger-maintained lower-case email for authorized operational lookup."""
    phone: Mapped[str] = mapped_column(String(50), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    retired_roles: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    """Roles the person has stepped back from, as ``{role: ISO retirement date}``. A retired role
    stays in ``roles`` (with every registration and help period) but the person no longer counts
    as an active member or volunteer; ``anonymised`` is the separate, person-wide marker.
    Derived from ``role_history`` and written only by ``app.services.role_history``."""
    role_history: Mapped[dict[str, list[dict[str, str | None]]]] = mapped_column(JSON, default=dict)
    """When each role was held: ``{role: [{"started_on", "ended_on"}, ...]}`` (ISO days, oldest
    first; no ``ended_on`` means in progress, a null ``started_on`` means unknown). See
    ``app.services.role_history``."""

    inactivity_exempt: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    inactivity_exempt_note: Mapped[str] = mapped_column(Text, default="", server_default="")

    national_register_number: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    """Belgium's National Register Number (NISS) — fixed and lifelong; this is
    what would be used to re-identify the person later. Volunteer-only (see
    docs/decisions/934-data-retention-and-erasure.md)."""
    eid_document_number: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    """The physical eID card's own document number, captured once at volunteer
    sign-up to support an insurance claim referencing that specific document.
    A point-in-time record, not a live one: the card (and this number) is
    typically renewed or replaced every 5-10 years, and nothing here
    re-verifies or re-prompts for an update when that happens — a volunteer
    can flag a renewal themselves via `POST /api/me/volunteer/eid-correction`
    (see `oidc_subject` below and docs/decisions/1006-volunteer-identity-self-service.md)."""

    oidc_subject: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    """The `sub` claim of the OIDC-authenticated volunteer this Person record
    is linked to, if any — established by the volunteer themselves via
    `POST /api/me/volunteer/register` (which creates this Person row from
    their submitted name/NISS/eID, or links to a pre-existing unlinked exact
    match) or set directly by an admin. Unlike `Person.roles`, this is
    independent of the OIDC `volunteer`/`admin` realm role used by
    `require_volunteer` for event-day access — it identifies *which* Person a
    token belongs to, not *whether* the token may act as a volunteer. See
    docs/decisions/1006-volunteer-identity-self-service.md."""
    visits_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    anonymised: Mapped[bool] = mapped_column(Boolean, default=False)
    """Set when the record has been anonymised (``people_service.anonymise_person``); such a person
    counts as inactive in every role and is not offered for anonymisation again."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    registrations: Mapped[list[Registration]] = relationship(back_populates="person")


class VolunteerPeriod(Base):
    """A volunteering period for a person with the volunteer role."""

    __tablename__ = "volunteer_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    first_help_day: Mapped[dt_date] = mapped_column(Date, nullable=False)
    last_help_day: Mapped[dt_date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    """Free-text rough schedule/notepad for this period (e.g. "Fri: bar,
    Sat: serving") — deliberately unstructured rather than a role/task
    model; admin-only, not surfaced to the volunteer themselves."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


POLL_QUESTION_KINDS = ("yes_no", "meals", "single_choice", "free_text", "rating")
"""Attendance, meal quantities, one configured choice, free text and fixed 1–5 ratings."""

MAX_POLL_PEOPLE = 10
"""The most people one "yes" can stand for (the volunteer plus guests)."""


class EditionPollQuestion(Base):
    """One question put to the volunteers of an edition.

    ``yes_no`` asks whether they join something and with how many people
    (`VolunteerPollAnswer`); ``meals`` offers `EditionPollOption`s of which they pick a quantity each
    (`VolunteerPollSelection`). Every question has its own translated title (Dutch required), an
    optional description, a place in the list and an optional closing time after which volunteers can
    no longer change their answer.
    """

    __tablename__ = "edition_poll_questions"
    __table_args__ = (
        CheckConstraint("event_id IS NULL OR kind = 'yes_no'", name="ck_poll_event_attendance"),
        CheckConstraint(
            "kind IN (" + ", ".join(f"'{kind}'" for kind in POLL_QUESTION_KINDS) + ")",
            name="ck_edition_poll_questions_kind",
        ),
        CheckConstraint("(length(trim(title_nl)) > 0) IS TRUE", name="ck_edition_poll_questions_title_nl"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_edition_poll_questions_description_nl"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("events.id", ondelete="RESTRICT"), unique=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    """When volunteers can no longer change their answer, or ``None`` while it stays open."""
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_title(self, locale: str | None) -> str:
        return resolve_text({"nl": self.title_nl, "fr": self.title_fr, "en": self.title_en}, locale)

    def localized_description(self, locale: str | None) -> str:
        return resolve_text({"nl": self.description_nl, "fr": self.description_fr, "en": self.description_en}, locale)


class EditionPollOption(Base):
    """An option offered to volunteers for a meals or single-choice question.
    The choices are catering-dependent and change every edition, so they are
    admin-configured content rather than a fixed list, mirroring how `Product`
    holds one event's orderable items. It belongs to an option-bearing question
    (`EditionPollQuestion`); a volunteer simply picks how many of each they want
    (`VolunteerPollSelection.quantity`).

    The label is translated like other content (Dutch required, French and English
    optional), so volunteers see it in their own language. `dietary_tags` flags what
    the dish suits or contains; the admin orders the list with `sort_order`.
    """

    __tablename__ = "edition_poll_options"
    __table_args__ = (
        CheckConstraint("(length(trim(label_nl)) > 0) IS TRUE", name="ck_edition_poll_options_label_nl"),
        UniqueConstraint("id", "question_id", name="uq_poll_option_question"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    """The question this option belongs to; ``edition_id`` is that question's edition."""
    label_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    label_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    label_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    """Shown to volunteers only (never public)."""
    dietary_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Values from ``app.schemas.DietaryTag``, e.g. ``["vegetarian", "gluten_free"]``."""
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    @property
    def label(self) -> str:
        """The Dutch label: what admin lists and audit entries show."""
        return self.label_nl

    def localized_label(self, locale: str | None) -> str:
        return resolve_text({"nl": self.label_nl, "fr": self.label_fr, "en": self.label_en}, locale)


MAX_POLL_QUANTITY = 20
"""The most of one option a single volunteer can ask for."""


class VolunteerPollSelection(Base):
    """How many of one `EditionPollOption` a volunteer wants. A row exists only
    for a quantity of at least one; choosing none deletes the row."""

    __tablename__ = "volunteer_poll_selections"
    __table_args__ = (
        CheckConstraint(f"quantity BETWEEN 1 AND {MAX_POLL_QUANTITY}", name="ck_volunteer_poll_selections_quantity"),
    )

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    option_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_options.id", ondelete="CASCADE"), primary_key=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class VolunteerPollAnswer(Base):
    """A volunteer's answer to a ``yes_no`` `EditionPollQuestion`: whether they join and, when they do,
    with how many people (themselves included). No row means not answered yet."""

    __tablename__ = "volunteer_poll_answers"
    __table_args__ = (
        CheckConstraint(
            f"(attending AND people BETWEEN 1 AND {MAX_POLL_PEOPLE}) OR (NOT attending AND people = 0)",
            name="ck_volunteer_poll_answers_people",
        ),
    )

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    attending: Mapped[bool] = mapped_column(Boolean, nullable=False)
    people: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class VolunteerPollChoice(Base):
    """One typed answer per volunteer and question; absence means unanswered."""

    __tablename__ = "volunteer_poll_choices"
    __table_args__ = (
        ForeignKeyConstraint(
            ["option_id", "question_id"],
            ["edition_poll_options.id", "edition_poll_options.question_id"],
            ondelete="CASCADE",
        ),
    )

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    option_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)


class VolunteerPollText(Base):
    """One typed answer per volunteer and question; absence means unanswered."""

    __tablename__ = "volunteer_poll_texts"
    __table_args__ = (CheckConstraint("length(trim(text)) BETWEEN 1 AND 500", name="ck_poll_texts_value"),)

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    text: Mapped[str] = mapped_column(String(500), nullable=False)


class VolunteerPollRating(Base):
    """One typed answer per volunteer and question; absence means unanswered."""

    __tablename__ = "volunteer_poll_ratings"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="ck_poll_ratings_value"),)

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)


class VolunteerMealNote(Base):
    """A volunteer's free-text dietary note (allergies, preferences) for one edition's ``meals`` questions."""

    __tablename__ = "volunteer_meal_notes"

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), primary_key=True
    )
    note: Mapped[str] = mapped_column(String(500), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class AuditEntry(Base):
    """Immutable audit record for high-impact event-day mutations."""

    __tablename__ = "audit_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(255), index=True)
    """OIDC ``sub`` claim, client IP for token-gated ops (``auth_source ==
    "token"``, set only by ``get_client_ip``'s callers — see
    ``app.ratelimit.get_client_ip``, whose fallback value is the literal
    string ``"unknown"`` when the connection has no resolvable peer), a
    visitor session's opaque ``User.id`` (``auth_source == "visitor_session"``
    — never the verified email itself, which would put PII in an audit trail
    kept indefinitely; see ``app.visitor_session.actor_for_user``), or
    'anonymous'. A row with ``auth_source == "token"`` has its actor blanked
    to ``""`` 30 days after ``timestamp`` by a VPS-scheduled job in
    ``tjorim/apps`` (`infra/scheduled-jobs/champagnefestival-redact-audit-entry-ips.sql`)
    — see docs/decisions/934-data-retention-and-erasure.md. The entry itself
    (action, resource, timestamp) is kept indefinitely; only the actor is
    time-limited. The job blanks every ``auth_source == "token"`` row
    unconditionally rather than pattern-matching for IP-shaped values: that
    ``auth_source`` is set by exactly this codebase's own writers, always
    paired with ``get_client_ip``'s output, so there is no other value it
    could hold to protect against — and blanking a placeholder like
    "unknown" is harmless either way, since it was never personal data."""
    auth_source: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown", index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    integration_client_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    resource_type: Mapped[str] = mapped_column(String(50), index=True)
    resource_id: Mapped[str] = mapped_column(String(64), index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class RateLimitBucket(Base):
    """Cross-worker fixed-window rate-limit counter (#932 decision 1).

    Backs ``app.ratelimit.check_rate_limit_pg`` — the Postgres-backed
    replacement for check-in's per-registration limit and shared-IP backstop,
    the two scopes this decision migrates off the in-process deque so they're
    enforced consistently across worker processes. ``key`` packs ``scope`` and
    the caller's bucket key (an IP or registration ID) with a separator that
    can't appear in either half; see ``app.ratelimit._bucket_key``. Swept daily
    by ``app.worker`` alongside the outbox cleanup.
    """

    __tablename__ = "rate_limit_buckets"

    key: Mapped[str] = mapped_column(String(300), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


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
    member_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    member_inactivity_months: Mapped[int | None] = mapped_column(Integer, nullable=True)

    stamp_card_type_id: Mapped[str | None] = mapped_column(ForeignKey("stamp_card_types.id", ondelete="RESTRICT"))
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    public_email: Mapped[str] = mapped_column(String(320), default="nancy.cattrysse@telenet.be")
    public_phone: Mapped[str] = mapped_column(String(30), default="+32 478 48 01 77")
    facebook_url: Mapped[str] = mapped_column(String(500), default="https://www.facebook.com/champagnefestival.kust")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class FaqItem(Base):
    """A single question/answer pair shown on the public FAQ section.

    Dutch must have both; other languages are optional translations. A language
    is shown only when its question *and* answer both have text, otherwise the
    Dutch text is shown.
    """

    __tablename__ = "faq_items"
    __table_args__ = (
        # Deferred so a reorder can touch several rows in one transaction
        # without a transient duplicate mid-transaction tripping the check —
        # only the state at commit has to be unique (#836).
        UniqueConstraint("sort_order", name="uq_faq_items_sort_order", deferrable=True, initially="DEFERRED"),
        CheckConstraint(
            "(length(trim(question_nl)) > 0 AND length(trim(answer_nl)) > 0) IS TRUE",
            name="ck_faq_items_nl",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    question_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    question_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    answer_nl: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized(self, locale: str | None) -> tuple[str, str]:
        """The (question, answer) for *locale*, falling back to Dutch."""
        return resolve_pair(
            {"nl": self.question_nl, "fr": self.question_fr, "en": self.question_en},
            {"nl": self.answer_nl, "fr": self.answer_fr, "en": self.answer_en},
            locale,
        )


class Announcement(Base):
    """A short, scheduled, localized operational notice."""

    __tablename__ = "announcements"
    __table_args__ = (
        UniqueConstraint("sort_order", name="uq_announcements_sort_order", deferrable=True, initially="DEFERRED"),
        CheckConstraint("level IN ('info', 'warning', 'urgent')", name="ck_announcements_level"),
        CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_announcements_window"),
        CheckConstraint("(length(trim(text_nl)) > 0) IS TRUE", name="ck_announcements_text_nl"),
        CheckConstraint(
            "(link_url IS NULL OR length(trim(link_label_nl)) > 0) IS TRUE",
            name="ck_announcements_link_label_nl",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    text_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    text_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    text_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    level: Mapped[str] = mapped_column(String(10), default="info")
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    link_label_nl: Mapped[str | None] = mapped_column(String(120), nullable=True)
    link_label_en: Mapped[str | None] = mapped_column(String(120), nullable=True)
    link_label_fr: Mapped[str | None] = mapped_column(String(120), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_text(self, locale: str | None) -> str:
        return resolve_text({"nl": self.text_nl, "fr": self.text_fr, "en": self.text_en}, locale)

    def localized_link_label(self, locale: str | None) -> str | None:
        if not self.link_url:
            return None
        return (
            resolve_text(
                {"nl": self.link_label_nl, "fr": self.link_label_fr, "en": self.link_label_en},
                locale,
            )
            or None
        )


class ComposedMessage(Base):
    """A centrally-composed operational message delivered through one or more
    explicit channels (#942): the in-app announcement banner and/or Web Push.

    Deliberately reuses ``Announcement``/``announcements_service`` for the
    in-app channel rather than a second in-app storage/delivery mechanism —
    selecting "announcement" here creates/publishes an ``Announcement`` row
    at send time (``announcement_id`` records which one). The Web Push
    channel enqueues one outbox delivery job per targeted subscriber.
    """

    __tablename__ = "composed_messages"
    __table_args__ = (
        CheckConstraint("level IN ('info', 'warning', 'urgent')", name="ck_composed_messages_level"),
        CheckConstraint("state IN ('draft', 'scheduled', 'sent')", name="ck_composed_messages_state"),
        CheckConstraint(
            "(length(trim(title_nl)) > 0 AND length(trim(body_nl)) > 0) IS TRUE",
            name="ck_composed_messages_nl",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    level: Mapped[str] = mapped_column(String(10), default="info")
    channels: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Values from ``{"announcement", "push", "email"}`` — at least one, enforced at
    the schema layer (a DB-level check on JSON array membership isn't worth
    the complexity here)."""
    link_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    email_category_key: Mapped[str | None] = mapped_column(
        ForeignKey("email_categories.key", ondelete="RESTRICT"), nullable=True
    )
    """Audience of the ``email`` channel (#1407): the people with consent for this category. Required
    exactly when ``email`` is a channel."""
    state: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    announcement_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("announcements.id", ondelete="SET NULL"), nullable=True
    )
    push_audience_snapshot: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    """``PushSubscription`` ids targeted at send time — null while
    ``draft``/``scheduled``, immutable once set (the transition to ``sent``
    resolves and freezes this in the same transaction). Resolved fresh at
    send time, not compose time."""
    email_audience_snapshot: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    """``Person`` ids mailed at send time (#1407), frozen like ``push_audience_snapshot``. Each
    recipient is checked again just before their mail is submitted."""
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class EmailSuppression(Base):
    """An address that member mail must never be sent to again (#1407).

    Only a hash of the normalised address is kept: enough to refuse the address, and nothing to erase
    with a person. Filled from the sending service's verified bounce and complaint feedback once a
    service is chosen; an entry is never removed automatically.
    """

    __tablename__ = "email_suppressions"
    __table_args__ = (CheckConstraint("reason IN ('hard_bounce', 'complaint')", name="ck_email_suppressions_reason"),)

    address_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    reason: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Policy(Base):
    """A versioned legal/policy document identified by a stable key (e.g. ``privacy``).

    The title is mutable chrome, not content — it lives here rather than on
    ``PolicyVersion`` because only published *content* needs to be immutable.
    Like other translated content it must have a Dutch title; the other languages
    are optional and visitors fall back to Dutch.
    """

    __tablename__ = "policies"
    __table_args__ = (CheckConstraint("(length(trim(title_nl)) > 0) IS TRUE", name="ck_policies_title_nl"),)

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    title_nl: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def localized_title(self, locale: str | None) -> str:
        return resolve_text({"nl": self.title_nl, "fr": self.title_fr, "en": self.title_en}, locale)

    versions: Mapped[list[PolicyVersion]] = relationship(
        back_populates="policy", order_by="PolicyVersion.version_number"
    )


class PolicyVersion(Base):
    """One revision of a policy's content.

    ``draft`` versions are freely editable. Publishing flips a draft to
    ``published`` and, in the same transaction, flips the previously-current
    ``published`` row to ``superseded`` — so at most one row per policy is ever
    ``published`` (enforced by the partial unique index below) and superseded/
    published rows are never mutated or deleted again. Rollback reuses the same
    draft-then-publish path: a new draft is seeded from an older version's
    content and published like any other draft, which is what gives it a new
    ``version_number`` and audit trail rather than resurrecting the old row.
    """

    __tablename__ = "policy_versions"
    __table_args__ = (
        UniqueConstraint("policy_key", "version_number", name="uq_policy_versions_number"),
        CheckConstraint("status IN ('draft', 'published', 'superseded')", name="ck_policy_versions_status"),
        CheckConstraint(
            "(status = 'draft' OR length(trim(content_nl)) > 0) IS TRUE",
            name="ck_policy_versions_nl",
        ),
        Index(
            "uq_policy_versions_one_draft",
            "policy_key",
            unique=True,
            postgresql_where=text("status = 'draft'"),
            sqlite_where=text("status = 'draft'"),
        ),
        Index(
            "uq_policy_versions_one_published",
            "policy_key",
            unique=True,
            postgresql_where=text("status = 'published'"),
            sqlite_where=text("status = 'published'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    policy_key: Mapped[str] = mapped_column(String(64), ForeignKey("policies.key"))
    version_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), default="draft")
    content_nl: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    created_by: Mapped[str] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    policy: Mapped[Policy] = relationship(back_populates="versions")

    def localized_content(self, locale: str | None) -> tuple[str, str]:
        """The (content, language it is written in) for *locale*, falling back to Dutch."""
        values = {"nl": self.content_nl, "fr": self.content_fr, "en": self.content_en}
        for language in (locale, BASE_LANGUAGE):
            if language and (values.get(language) or "").strip():
                return values[language] or "", language
        return "", BASE_LANGUAGE


class SignageChannel(Base):
    """An explicitly edition-scoped public screen playlist with a fixed clock origin."""

    __tablename__ = "signage_channels"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    edition_id: Mapped[str] = mapped_column(ForeignKey("editions.id", ondelete="RESTRICT"))
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    epoch: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class SignageTemplate(Base):
    """Validated canvas document, shared between channels."""

    __tablename__ = "signage_templates"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    background: Mapped[dict] = mapped_column(JSON)
    layers: Mapped[list] = mapped_column(JSON, default=list)


class SignageSlide(Base):
    __tablename__ = "signage_slides"
    __table_args__ = (
        CheckConstraint("duration > 0 AND duration <= 3600", name="ck_signage_duration"),
        CheckConstraint("kind IN ('organizations', 'notice', 'image')", name="ck_signage_kind"),
        CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_signage_window"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    channel_id: Mapped[str] = mapped_column(ForeignKey("signage_channels.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[str] = mapped_column(ForeignKey("signage_templates.id", ondelete="RESTRICT"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(20))
    duration: Mapped[int] = mapped_column(Integer, default=10)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    content: Mapped[dict] = mapped_column(JSON, default=dict)


class SignageVideoExport(Base):
    """Private, creator-owned frozen exports; retry identities outlive worker tombstones."""

    __tablename__ = "signage_video_exports"
    __table_args__ = (UniqueConstraint("creator", "idempotency_key", name="uq_signage_video_creator_key"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    creator: Mapped[str] = mapped_column(String(255), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    channel_id: Mapped[str | None] = mapped_column(ForeignKey("signage_channels.id", ondelete="SET NULL"), index=True)
    channel_name: Mapped[str] = mapped_column(String(200))
    locale: Mapped[str] = mapped_column(String(2))
    snapshot: Mapped[dict] = mapped_column(JSON)
    profile: Mapped[str] = mapped_column(String(40), default="signage-slideshow-v1")
    uploads: Mapped[dict] = mapped_column(JSON, default=dict)
    payload_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    state: Mapped[str] = mapped_column(String(20), default="preparing", index=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    local_cleaned: Mapped[bool] = mapped_column(Boolean, default=False)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    artifact: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class EventOrderQuestion(Base):
    """Optional information collected once per visitor order, separately from priced products."""

    __tablename__ = "event_order_questions"
    __table_args__ = (
        CheckConstraint("kind IN ('single_choice', 'free_text', 'rating')", name="ck_order_question_kind"),
        CheckConstraint("length(trim(title_nl)) > 0", name="ck_order_question_title"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_order_question_description"),
        UniqueConstraint("id", "kind", name="uq_order_question_kind"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), ForeignKey("events.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    options: Mapped[list[EventOrderOption]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="EventOrderOption.sort_order, EventOrderOption.id"
    )

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "active": self.active,
            **{
                key: getattr(self, key)
                for key in ("title_nl", "title_fr", "title_en", "description_nl", "description_fr", "description_en")
            },
            "options": [
                {"id": o.id, "label_nl": o.label_nl, "label_fr": o.label_fr, "label_en": o.label_en}
                for o in self.options
            ],
        }


class EventOrderOption(Base):
    __tablename__ = "event_order_options"
    __table_args__ = (
        UniqueConstraint("id", "question_id", name="uq_order_option_question"),
        CheckConstraint("length(trim(label_nl)) > 0", name="ck_order_option_label"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("event_order_questions.id", ondelete="CASCADE"), index=True
    )
    label_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    label_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    label_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RegistrationOrderAnswer(Base):
    __tablename__ = "registration_order_answers"
    __table_args__ = (
        ForeignKeyConstraint(
            ["question_id", "kind"], ["event_order_questions.id", "event_order_questions.kind"], ondelete="RESTRICT"
        ),
        ForeignKeyConstraint(
            ["option_id", "question_id"],
            ["event_order_options.id", "event_order_options.question_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "(kind = 'single_choice' AND option_id IS NOT NULL AND text IS NULL AND rating IS NULL) OR (kind = 'free_text' AND option_id IS NULL AND text IS NOT NULL AND length(trim(text)) BETWEEN 1 AND 500 AND rating IS NULL) OR (kind = 'rating' AND option_id IS NULL AND text IS NULL AND rating IS NOT NULL AND rating BETWEEN 1 AND 5)",
            name="ck_order_answer_value",
        ),
    )
    registration_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
    )
    question_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    option_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    question: Mapped[EventOrderQuestion] = relationship(foreign_keys=[question_id, kind], lazy="joined")

    def as_dict(self) -> dict:
        return {
            "question_id": self.question_id,
            "option_id": self.option_id,
            "text": self.text,
            "rating": self.rating,
            "question": self.question.as_dict(),
        }


class PollDeletionNotification(Base):
    """Immutable email snapshot; survives deletion of the question and its answers."""

    __tablename__ = "poll_deletion_notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    recipient: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)


Index(
    "uq_people_current_member_email",
    func.lower(trim_spaces(Person.email)),
    unique=True,
    postgresql_where=text(
        "NOT anonymised AND CAST(roles AS text) LIKE '%\"member\"%' AND retired_roles ->> 'member' IS NULL AND trim(email) <> ''"
    ),
    sqlite_where=text(
        "NOT anonymised AND CAST(roles AS text) LIKE '%\"member\"%' AND json_extract(retired_roles, '$.member') IS NULL AND trim(email) <> ''"
    ),
)


class StampCardType(Base):
    __tablename__ = "stamp_card_types"
    __table_args__ = (
        CheckConstraint("box_count > 0", name="ck_stamp_card_type_boxes"),
        CheckConstraint(
            "length(trim(name_nl)) > 0 AND length(trim(reward_label_nl)) > 0", name="ck_stamp_card_type_nl"
        ),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name_nl: Mapped[str] = mapped_column(String(200))
    name_fr: Mapped[str | None] = mapped_column(String(200))
    name_en: Mapped[str | None] = mapped_column(String(200))
    box_count: Mapped[int] = mapped_column(Integer)
    reward_label_nl: Mapped[str] = mapped_column(String(200))
    reward_label_fr: Mapped[str | None] = mapped_column(String(200))
    reward_label_en: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class StampCard(Base):
    __tablename__ = "stamp_cards"
    __table_args__ = (CheckConstraint("box_count > 0", name="ck_stamp_card_boxes"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="RESTRICT"), index=True)
    type_id: Mapped[str] = mapped_column(ForeignKey("stamp_card_types.id", ondelete="RESTRICT"))
    box_count: Mapped[int] = mapped_column(Integer)
    reward_label_nl: Mapped[str] = mapped_column(String(200))
    reward_label_fr: Mapped[str | None] = mapped_column(String(200))
    reward_label_en: Mapped[str | None] = mapped_column(String(200))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Stamp(Base):
    __tablename__ = "stamps"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("stamp_cards.id", ondelete="RESTRICT"), index=True)
    registration_id: Mapped[str] = mapped_column(ForeignKey("registrations.id", ondelete="RESTRICT"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class StampCardReward(Base):
    __tablename__ = "stamp_card_rewards"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("stamp_cards.id", ondelete="RESTRICT"), unique=True)
    reward_label_nl: Mapped[str] = mapped_column(String(200))
    reward_label_fr: Mapped[str | None] = mapped_column(String(200))
    reward_label_en: Mapped[str | None] = mapped_column(String(200))
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    handed_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handed_out_by: Mapped[str | None] = mapped_column(String(200))


class EmailCategory(Base):
    """A kind of email a person can consent to receive (#1408).

    The key is the stable identity consent records point at. ``allowed_roles`` lists the roles that
    may use the category (empty means everyone); a role is checked when consent is given and again at
    send time. ``automatic`` marks categories whose mail is triggered by application code; it is set
    only for the seeded defaults, so editing a category never adds a sending capability.
    """

    __tablename__ = "email_categories"
    __table_args__ = (
        CheckConstraint("(length(trim(name_nl)) > 0) IS TRUE", name="ck_email_categories_name_nl"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_email_categories_description_nl"),
    )

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    name_nl: Mapped[str] = mapped_column(String(100))
    name_fr: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    allowed_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    automatic: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_name(self, locale: str | None) -> str:
        return resolve_text({"nl": self.name_nl, "fr": self.name_fr, "en": self.name_en}, locale)

    def localized_description(self, locale: str | None) -> str | None:
        return (
            resolve_text({"nl": self.description_nl, "fr": self.description_fr, "en": self.description_en}, locale)
            or None
        )


class EmailConsent(Base):
    """One grant of consent by a person for an email category, and how it ended (#1408).

    A grant is written only by the person themselves (the signed-in preferences screen, or the
    confirmation link of the registration form). Withdrawing sets ``revoked_at``; a new grant after
    that is a new row, so the history of grants and withdrawals survives. At most one grant per
    person and category is open at a time.
    """

    __tablename__ = "email_consents"
    __table_args__ = (
        CheckConstraint("(revoked_at IS NULL) = (revoked_source IS NULL)", name="ck_email_consents_revocation"),
        Index(
            "uq_email_consents_open",
            "person_id",
            "category_key",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
            sqlite_where=text("revoked_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), index=True)
    category_key: Mapped[str] = mapped_column(ForeignKey("email_categories.key", ondelete="RESTRICT"), index=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    source: Mapped[str] = mapped_column(String(30))
    """``self_service`` (preferences screen) or ``registration_form`` (confirmed through the emailed link)."""
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    """``self_service``, ``admin`` (an administrator recorded an opt-out) or ``merged`` (superseded by the
    surviving person's own open grant when two people were merged)."""


class EmailConsentConfirmation(Base):
    """A pending, emailed request to activate consent for an address nobody has verified yet (#1408).

    Created when the registration form's updates option is ticked without a verified email for the
    person. Only the token hash is stored; opening the link activates the consent and removes the row.
    """

    __tablename__ = "email_consent_confirmations"
    __table_args__ = (UniqueConstraint("person_id", "category_key", name="uq_email_consent_confirmation"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), index=True)
    category_key: Mapped[str] = mapped_column(ForeignKey("email_categories.key", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
