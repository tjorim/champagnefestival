"""Fixed vocabularies shared by persistence and API validation."""

from enum import StrEnum
from typing import Literal


class OrganizationType(StrEnum):
    PRODUCER = "producer"
    SPONSOR = "sponsor"
    VENDOR = "vendor"


TableShape = Literal["rectangle", "round"]
TableHeight = Literal["low", "high"]


class OutboxState(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    DELIVERED = "delivered"
    FAILED = "failed"


class DeliveryOutcome(StrEnum):
    DELIVERED = "delivered"
    FAILED = "failed"
    UNKNOWN = "unknown"


class VideoExportState(StrEnum):
    PREPARING = "preparing"
    SUBMITTED = "submitted"
    QUEUED = "queued"
    RUNNING = "running"
    READY = "ready"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class VideoExportProfile(StrEnum):
    SLIDESHOW_V1 = "signage-slideshow-v1"


DirectoryRole = Literal["member", "volunteer"]
IntegrationRole = Literal["admin", "volunteer"]
ConsentSource = Literal["self_service", "registration_form", "unknown"]
ConsentRevocationSource = Literal["self_service", "admin", "merged", "unsubscribe_link", "unknown"]
AuditSource = Literal["unknown", "none", "integration", "keycloak", "token", "visitor_session"]
Locale = Literal["nl", "fr", "en"]
RegistrationStatus = Literal["pending", "confirmed", "cancelled"]
PaymentStatus = Literal["unpaid", "partial", "paid"]
EditionType = Literal["festival", "bourse", "capsule_exchange"]
ProductUnit = Literal["item", "table", "person"]
AnnouncementLevel = Literal["info", "warning", "urgent"]
PolicyVersionStatus = Literal["draft", "published", "superseded"]
SlideKind = Literal["organizations", "notice", "image"]
OrderQuestionKind = Literal["single_choice", "free_text", "rating"]
PollQuestionKind = Literal["yes_no", "meals", OrderQuestionKind]
EditionMonth = Literal[
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]
SponsorTier = Literal["main", "partner", "supporter"]
OrganizationChangeStatus = Literal["pending", "accepted", "rejected", "superseded", "replaced"]
ComposedMessageState = Literal["draft", "scheduled", "sent"]
SuppressionReason = Literal["hard_bounce", "complaint"]
