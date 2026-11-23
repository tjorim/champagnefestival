"""SQLAlchemy ORM models, one module per domain.

Every module is imported here so that ``Base.metadata`` (Alembic's ``target_metadata``) and the mapper
registry see every table; ``from app.models import X`` keeps working through the re-exports below."""

import app.models.base  # noqa: F401
from app.models.announcements import Announcement
from app.models.audit import AuditEntry
from app.models.categories import EventCategory, ProductCategory
from app.models.composer import ComposedMessage
from app.models.contact import ContactMessage
from app.models.editions import Edition, EditionOrganization
from app.models.email_preferences import EmailCategory, EmailConsent, EmailConsentConfirmation, EmailSuppression
from app.models.events import Event
from app.models.faq import FaqItem
from app.models.idempotency import IdempotencyKey
from app.models.integration_clients import IntegrationClient
from app.models.layouts import Area, Layout, LayoutRevision
from app.models.orders import EventOrderOption, EventOrderQuestion, RegistrationOrderAnswer
from app.models.organizations import Organization, OrganizationChange
from app.models.outbox import DeliveryAttempt, OutboxJob
from app.models.payments import PaymentTransaction
from app.models.pebble import PebbleAccessToken
from app.models.people import Person
from app.models.policies import Policy, PolicyVersion
from app.models.poll import (
    MAX_POLL_PEOPLE,
    MAX_POLL_QUANTITY,
    EditionPollOption,
    EditionPollQuestion,
    PollDeletionNotification,
    VolunteerMealNote,
    VolunteerPollAnswer,
    VolunteerPollChoice,
    VolunteerPollRating,
    VolunteerPollSelection,
    VolunteerPollText,
)
from app.models.products import Product
from app.models.push import PushSubscription
from app.models.rate_limits import RateLimitBucket
from app.models.registrations import Registration, RegistrationAllocation
from app.models.settings import AppSettings
from app.models.signage import SignageChannel, SignageSlide, SignageTemplate, SignageVideoExport
from app.models.stamp_cards import Stamp, StampCard, StampCardReward, StampCardType
from app.models.tables import Table, TableType
from app.models.users import User, VisitorMagicLink, VisitorSession
from app.models.venues import Room, Venue
from app.models.volunteers import VolunteerPeriod
from app.models.waitlist import WaitlistEntry

__all__ = [
    "Announcement",
    "AppSettings",
    "Area",
    "AuditEntry",
    "ComposedMessage",
    "ContactMessage",
    "DeliveryAttempt",
    "Edition",
    "EditionOrganization",
    "EditionPollOption",
    "EditionPollQuestion",
    "EmailCategory",
    "EmailConsent",
    "EmailConsentConfirmation",
    "EmailSuppression",
    "Event",
    "EventCategory",
    "EventOrderOption",
    "EventOrderQuestion",
    "FaqItem",
    "IdempotencyKey",
    "IntegrationClient",
    "Layout",
    "LayoutRevision",
    "MAX_POLL_PEOPLE",
    "MAX_POLL_QUANTITY",
    "Organization",
    "OrganizationChange",
    "OutboxJob",
    "PaymentTransaction",
    "PebbleAccessToken",
    "Person",
    "Policy",
    "PolicyVersion",
    "PollDeletionNotification",
    "Product",
    "ProductCategory",
    "PushSubscription",
    "RateLimitBucket",
    "Registration",
    "RegistrationAllocation",
    "RegistrationOrderAnswer",
    "Room",
    "SignageChannel",
    "SignageSlide",
    "SignageTemplate",
    "SignageVideoExport",
    "Stamp",
    "StampCard",
    "StampCardReward",
    "StampCardType",
    "Table",
    "TableType",
    "User",
    "Venue",
    "VisitorMagicLink",
    "VisitorSession",
    "VolunteerMealNote",
    "VolunteerPeriod",
    "VolunteerPollAnswer",
    "VolunteerPollChoice",
    "VolunteerPollRating",
    "VolunteerPollSelection",
    "VolunteerPollText",
    "WaitlistEntry",
]
