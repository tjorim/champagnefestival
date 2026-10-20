"""Meal options of a ``meals`` poll question (admin only; see ``app.services.poll_questions_service`` for
the questions themselves).

Used by both ``app.routers.poll_options`` (REST) and ``app.mcp.admin.poll`` (MCP). Raises
``HTTPException`` directly; the MCP adapter translates it into ``MCPToolError`` at its own boundary
(``app.mcp.utils.as_value_error``).
"""

from __future__ import annotations

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import EditionPollOption, VolunteerPollChoice, VolunteerPollSelection
from app.schemas import PollOptionCreate, PollOptionLabels, PollOptionReorder, PollOptionUpdate
from app.services.errors import ApiHTTPException
from app.services.poll_common import OPTION_ORDER, get_question_or_404, is_closed, lock_edition
from app.services.poll_kinds import kind_of
from app.utils import get_or_404, make_id, poll_option_to_dict


async def get_poll_option_or_404(db: AsyncSession, option_id: str) -> EditionPollOption:
    return await get_or_404(db, EditionPollOption, option_id, "Poll option not found.")


async def list_poll_options(
    db: AsyncSession,
    *,
    question_id: str | None = None,
    edition_id: str | None = None,
    locale: str | None = None,
) -> list[dict]:
    """Options in display order with what volunteers asked for in total (what to order from the caterer)."""
    choice_count = (
        select(func.count())
        .select_from(VolunteerPollChoice)
        .where(VolunteerPollChoice.option_id == EditionPollOption.id)
        .correlate(EditionPollOption)
        .scalar_subquery()
    )
    stmt = (
        select(
            EditionPollOption,
            func.coalesce(func.sum(VolunteerPollSelection.quantity), 0),
            func.count(VolunteerPollSelection.volunteer_id),
            choice_count,
        )
        .outerjoin(VolunteerPollSelection, VolunteerPollSelection.option_id == EditionPollOption.id)
        .group_by(EditionPollOption.id)
        .order_by(*OPTION_ORDER)
    )
    if question_id is not None:
        stmt = stmt.where(EditionPollOption.question_id == question_id)
    if edition_id is not None:
        stmt = stmt.where(EditionPollOption.edition_id == edition_id)
    return [
        poll_option_to_dict(
            option,
            total_quantity=int(total) + int(choices),
            volunteer_count=int(count) + int(choices),
            locale=locale,
        )
        for option, total, count, choices in (await db.execute(stmt)).all()
    ]


async def _one(db: AsyncSession, option: EditionPollOption) -> dict:
    totals = await list_poll_options(db, question_id=option.question_id)
    return next(entry for entry in totals if entry["id"] == option.id)


async def _next_sort_order(db: AsyncSession, question_id: str) -> int:
    highest = (
        await db.execute(
            select(func.max(EditionPollOption.sort_order)).where(EditionPollOption.question_id == question_id)
        )
    ).scalar_one()
    return 0 if highest is None else highest + 1


async def create_poll_option(
    db: AsyncSession, body: PollOptionCreate, *, actor: str, request_id: str | None = None
) -> dict:
    question = await get_question_or_404(db, body.question_id)
    if not kind_of(question).has_options:
        raise ApiHTTPException(422, "poll_question_not_meals", "This question kind does not have options.")
    await lock_edition(db, question.edition_id)
    option = EditionPollOption(
        id=make_id("poll"),
        edition_id=question.edition_id,
        question_id=question.id,
        label_nl=body.label_nl or "",
        label_fr=body.label_fr,
        label_en=body.label_en,
        dietary_tags=list(body.dietary_tags),
        sort_order=await _next_sort_order(db, question.id),
    )
    db.add(option)
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_option_created",
        resource_type="edition_poll_option",
        resource_id=option.id,
        request_id=request_id,
        details={"edition_id": option.edition_id, "question_id": question.id, "label": option.label_nl},
    )
    await db.commit()
    await db.refresh(option)
    return poll_option_to_dict(option)


async def update_poll_option(
    db: AsyncSession, option_id: str, body: PollOptionUpdate, *, actor: str, request_id: str | None = None
) -> dict:
    option = await get_poll_option_or_404(db, option_id)
    # Validate the merged labels before mutating: a partial update may change a single translation.
    fields_set = body.model_fields_set
    labels = {name: getattr(option, name) for name in ("label_nl", "label_fr", "label_en")}
    labels.update(body.model_dump(include={"label_nl", "label_fr", "label_en"}, exclude_unset=True))
    try:
        validated = PollOptionLabels.model_validate(labels).validate_dutch()
    except (ValueError, ValidationError) as exc:
        raise ApiHTTPException(422, "poll_option_invalid", "A meal option requires a non-empty Dutch label.") from exc
    for name in ("label_nl", "label_fr", "label_en"):
        setattr(option, name, getattr(validated, name))
    if "dietary_tags" in fields_set and body.dietary_tags is not None:
        option.dietary_tags = list(body.dietary_tags)
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_option_updated",
        resource_type="edition_poll_option",
        resource_id=option.id,
        request_id=request_id,
        details={"label": option.label_nl, "fields_changed": sorted(fields_set)},
    )
    await db.commit()
    await db.refresh(option)
    return await _one(db, option)


async def delete_poll_option(
    db: AsyncSession,
    option_id: str,
    *,
    actor: str,
    request_id: str | None = None,
    confirm_selections: bool = False,
) -> None:
    """Delete an option. When volunteers already picked it, the caller must confirm that their picks
    are removed, and a closed question refuses the deletion outright: its picks are final."""
    option = await get_poll_option_or_404(db, option_id)
    picks = (
        await db.execute(
            select(VolunteerPollSelection.volunteer_id, VolunteerPollSelection.quantity).where(
                VolunteerPollSelection.option_id == option_id
            )
        )
    ).all()
    picks = [(volunteer, quantity) for volunteer, quantity in picks]
    picks.extend(
        (volunteer_id, 1)
        for volunteer_id in (
            await db.execute(select(VolunteerPollChoice.volunteer_id).where(VolunteerPollChoice.option_id == option_id))
        ).scalars()
    )
    if picks:
        question = await get_question_or_404(db, option.question_id)
        if is_closed(question):
            raise ApiHTTPException(
                409,
                "poll_question_closed",
                "The question has closed and volunteers picked this option; reopen it before deleting.",
            )
        if not confirm_selections:
            raise ApiHTTPException(
                409,
                "poll_option_in_use",
                f"{len(picks)} volunteer(s) picked this option ({sum(q for _, q in picks)} in total); "
                "confirm to remove their picks.",
            )
    # ON DELETE CASCADE on volunteer_poll_selections.option_id would do this
    # anyway; deleting explicitly keeps the audit trail's ordering obvious.
    await db.execute(delete(VolunteerPollSelection).where(VolunteerPollSelection.option_id == option_id))
    await db.execute(delete(VolunteerPollChoice).where(VolunteerPollChoice.option_id == option_id))
    await db.delete(option)
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_option_deleted",
        resource_type="edition_poll_option",
        resource_id=option_id,
        request_id=request_id,
        details={
            "label": option.label_nl,
            "removed_picks": [{"volunteer_id": volunteer, "quantity": quantity} for volunteer, quantity in picks],
        },
    )
    await db.commit()


async def reorder_poll_options(
    db: AsyncSession, body: PollOptionReorder, *, actor: str, request_id: str | None = None
) -> list[dict]:
    """Assign every option of the question its position; ``ordered_ids`` names each exactly once."""
    question = await get_question_or_404(db, body.question_id)
    await lock_edition(db, question.edition_id)
    options = list(
        (await db.execute(select(EditionPollOption).where(EditionPollOption.question_id == question.id)))
        .scalars()
        .all()
    )
    if len(set(body.ordered_ids)) != len(body.ordered_ids) or set(body.ordered_ids) != {o.id for o in options}:
        raise ApiHTTPException(
            400, "poll_option_invalid_order", "ordered_ids must contain every option of the question exactly once."
        )
    by_id = {option.id: option for option in options}
    for position, option_id in enumerate(body.ordered_ids):
        by_id[option_id].sort_order = position
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_options_reordered",
        resource_type="edition_poll_option",
        resource_id=question.id,
        request_id=request_id,
        details={"ordered_ids": body.ordered_ids},
    )
    await db.commit()
    return await list_poll_options(db, question_id=question.id)
