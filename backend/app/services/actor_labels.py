"""Resolve actor identities from current records without storing display names."""

from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IntegrationClient, Person, User
from app.schemas.actors import ActorLabel
from app.services.audit_service import audit_provenance

type Actor = tuple[str, str | None]


async def resolve_actor_labels(db: AsyncSession, actors: Iterable[Actor]) -> dict[Actor, ActorLabel]:
    labels: dict[Actor, ActorLabel] = {}
    people: dict[str, set[Actor]] = defaultdict(set)
    visitors: dict[str, set[Actor]] = defaultdict(set)
    integrations: dict[str, set[Actor]] = defaultdict(set)

    for key in set(actors):
        actor, source = key
        source = source if source and source != "unknown" else audit_provenance(actor)[0]
        if source == "integration":
            labels[key] = ActorLabel(kind="integration")
            integrations[actor.removeprefix("integration:")].add(key)
        elif source in {"none", "token"} or actor == "anonymous":
            labels[key] = ActorLabel(kind="visitor")
        elif actor in {"", "system", "migration", "seed"} or actor.startswith("migration:"):
            labels[key] = ActorLabel(kind="system")
        elif source == "visitor_session" or actor.startswith("usr_"):
            labels[key] = ActorLabel(kind="visitor")
            visitors[actor].add(key)
        else:
            labels[key] = ActorLabel(kind="unknown")
            people[actor].add(key)

    if integrations:
        result = await db.execute(
            select(IntegrationClient.id, IntegrationClient.name).where(IntegrationClient.id.in_(integrations))
        )
        for client_id, name in result:
            for key in integrations[client_id]:
                labels[key] = ActorLabel(kind="integration", name=name)

    if people:
        result = await db.execute(
            select(Person.oidc_subject, Person.name).where(Person.oidc_subject.in_(people), ~Person.anonymised)
        )
        for subject, name in result:
            if subject is not None:
                for key in people[subject]:
                    labels[key] = ActorLabel(kind="person", name=name)

    # Booking ownership can be delegated. Match a portal account by its verified
    # address and use the name only when it identifies a single active record.
    unmatched = {actor for actor, keys in people.items() if all(labels[key].name is None for key in keys)}
    if visitors or unmatched:
        rows = await db.execute(
            select(User.id, User.oidc_subject, Person.id, Person.name)
            .select_from(User)
            .join(Person, Person.search_email == User.verified_email)
            .where(or_(User.id.in_(visitors), User.oidc_subject.in_(unmatched)), ~Person.anonymised)
            .distinct()
        )
        candidates: dict[Actor, dict[str, str]] = defaultdict(dict)
        for user_id, subject, person_id, name in rows:
            for key in visitors.get(user_id, ()):
                candidates[key][person_id] = name
            if subject is not None and subject in unmatched:
                for key in people[subject]:
                    candidates[key][person_id] = name
        for key, names in candidates.items():
            if len(names) == 1:
                labels[key] = ActorLabel(kind="person", name=next(iter(names.values())))
    return labels


async def labels_by_actor(db: AsyncSession, actors: Iterable[str]) -> dict[str, ActorLabel]:
    labels = await resolve_actor_labels(db, ((actor, None) for actor in actors))
    return {actor: label for (actor, _), label in labels.items()}
