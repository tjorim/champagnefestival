"""Resolve current names for the resources on a page of the admin audit trail."""

from collections import defaultdict

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Announcement,
    Area,
    AuditEntry,
    ComposedMessage,
    Edition,
    EditionPollOption,
    EditionPollQuestion,
    EmailCategory,
    Event,
    EventCategory,
    FaqItem,
    IntegrationClient,
    Layout,
    LayoutRevision,
    Organization,
    Person,
    Product,
    ProductCategory,
    Registration,
    Room,
    SignageChannel,
    SignageTemplate,
    StampCardReward,
    StampCardType,
    Table,
    TableType,
    Venue,
)
from app.schemas.audit import AuditEntryBaseOut, AuditEntryOut

NAMED_RESOURCES = {
    "announcement": (Announcement.id, Announcement.text_nl),
    "area": (Area.id, Area.label),
    "composed_message": (ComposedMessage.id, ComposedMessage.title_nl),
    "edition": (
        Edition.id,
        cast(func.upper(func.substr(Edition.month, 1, 1)), String)
        + func.substr(Edition.month, 2)
        + " "
        + cast(Edition.year, String),
    ),
    "edition_poll_option": (EditionPollOption.id, EditionPollOption.label_nl),
    "edition_poll_question": (EditionPollQuestion.id, EditionPollQuestion.title_nl),
    "email_category": (EmailCategory.key, EmailCategory.name_nl),
    "event": (Event.id, Event.title_nl),
    "event_category": (EventCategory.key, EventCategory.label_nl),
    "faq_item": (FaqItem.id, FaqItem.question_nl),
    "integration_client": (IntegrationClient.id, IntegrationClient.name),
    "layout": (Layout.id, Layout.label),
    "layout_revision": (LayoutRevision.id, LayoutRevision.label),
    "organization": (cast(Organization.id, String), Organization.name),
    "person": (Person.id, Person.name),
    "product": (Product.id, Product.name_nl),
    "product_category": (ProductCategory.key, ProductCategory.label_nl),
    "room": (Room.id, Room.name),
    "signage_channels": (SignageChannel.id, SignageChannel.name),
    "signage_templates": (SignageTemplate.id, SignageTemplate.name),
    "stamp_card_reward": (StampCardReward.id, StampCardReward.reward_label_nl),
    "stamp_card_type": (StampCardType.id, StampCardType.name_nl),
    "table": (Table.id, Table.name),
    "table_type": (TableType.id, TableType.name),
    "venue": (Venue.id, Venue.name),
}


async def audit_entries_with_resource_names(db: AsyncSession, entries: list[AuditEntry]) -> list[AuditEntryOut]:
    ids_by_type: dict[str, set[str]] = defaultdict(set)
    for entry in entries:
        ids_by_type[entry.resource_type].add(entry.resource_id)

    resources: dict[tuple[str, str], str | None] = {}
    for resource_type, ids in ids_by_type.items():
        if resource_type == "registration":
            query = select(Registration.id, Person.name).join(Person, Person.id == Registration.person_id)
            rows = await db.execute(query.where(Registration.id.in_(ids)))
        elif resource_type in NAMED_RESOURCES:
            id_column, name_column = NAMED_RESOURCES[resource_type]
            rows = await db.execute(select(id_column, name_column).where(id_column.in_(ids)))
        else:
            continue
        resources.update({(resource_type, str(resource_id)): name for resource_id, name in rows})

    result = []
    for entry in entries:
        key = (entry.resource_type, entry.resource_id)
        details = entry.details
        historical_name = details.get("name") or details.get("title")
        name = resources.get(key) or (historical_name if isinstance(historical_name, str) else None)
        result.append(
            AuditEntryOut(
                **AuditEntryBaseOut.model_validate(entry).model_dump(),
                resource_name=name,
                resource_exists=key in resources,
            )
        )
    return result
