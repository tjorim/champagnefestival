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

    # An actor is an OIDC subject (a signed-in caller) or a portal user id (a visitor session). The name comes
    # from the person the account is linked to (``people.user_id``); an account nobody linked has no name.
    if people or visitors:
        rows = await db.execute(
            select(User.id, User.oidc_subject, Person.name)
            .join(Person, Person.user_id == User.id)
            .where(or_(User.id.in_(visitors), User.oidc_subject.in_(people)), ~Person.anonymised)
        )
        for user_id, subject, name in rows:
            for key in (*visitors.get(user_id, ()), *(people.get(subject, ()) if subject is not None else ())):
                labels[key] = ActorLabel(kind="person", name=name)
    return labels


async def labels_by_actor(db: AsyncSession, actors: Iterable[str]) -> dict[str, ActorLabel]:
    labels = await resolve_actor_labels(db, ((actor, None) for actor in actors))
    return {actor: label for (actor, _), label in labels.items()}
