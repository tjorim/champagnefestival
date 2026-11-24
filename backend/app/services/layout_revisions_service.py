"""Layout revisions: saved snapshots, comparison and restore (#1021).

Used by both ``app.routers.layouts`` (REST) and ``app.mcp.admin.layouts`` (MCP), like the rest of the layout operations
in ``app.services.layouts_service`` (layout create/copy/list/delete), which this module was split from."""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import make_id
from app.models import (
    Area,
    Layout,
    LayoutRevision,
    Registration,
    RegistrationAllocation,
    Room,
    Table,
    TableType,
)
from app.schemas import (
    CURRENT_REVISION_REF,
    LayoutOut,
    LayoutRestorePreview,
    LayoutRevisionDiff,
    LayoutRevisionOut,
    LayoutRevisionSaveRequest,
)
from app.schemas.actors import ActorLabel
from app.services.actor_labels import labels_by_actor
from app.services.audit_service import write_audit_entry
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.services.layouts_service import get_layout

# Fields compared between two table/area snapshot entries matched by stable id
# (see _diff_objects). Geometry/type fields also decide whether a restore
# would "move" a table for allocation-conflict purposes — see
# _GEOMETRY_TABLE_FIELDS below.
#
# Deliberately excludes table_type_name/capacity/width_m/length_m: those are
# derived from the referenced TableType row, not owned by Table itself, and
# restore only ever writes Table.table_type_id (never mutates a shared
# TableType). Comparing the derived fields directly would report a "changed"
# table whenever someone edits a TableType's own attributes elsewhere — a
# difference restore can't actually fix — instead of only real per-table
# changes. table_type_id alone still surfaces a type/capacity change, since
# capacity/dimensions follow the type.
_TABLE_DIFF_FIELDS = ("name", "x", "y", "rotation", "table_type_id")
_AREA_DIFF_FIELDS = ("label", "icon", "x", "y", "rotation", "width_m", "length_m")
_GEOMETRY_TABLE_FIELDS = frozenset({"x", "y", "rotation", "table_type_id"})
_GEOMETRY_AREA_FIELDS = frozenset({"x", "y", "rotation", "width_m", "length_m"})


def _revision_to_out(rev: LayoutRevision, label: ActorLabel) -> LayoutRevisionOut:
    return LayoutRevisionOut(
        id=rev.id,
        layout_id=rev.layout_id,
        revision_number=rev.revision_number,
        label=rev.label,
        change_note=rev.change_note,
        created_by=rev.created_by,
        actor_label=label,
        created_at=rev.created_at,
        snapshot=rev.snapshot,
    )


async def _build_snapshot(db: AsyncSession, layout: Layout) -> dict:
    """Build a geometry-only, stable-identity snapshot of a layout's current
    tables and areas — the shared shape used both when saving a revision and
    when treating the live layout as the ``current`` side of a compare/restore
    preview. Excludes allocations (registrations, ``Area.organization_id``): those
    remain live operational data, never captured or restored by a revision."""
    tables = (
        (await db.execute(select(Table).where(Table.layout_id == layout.id).order_by(Table.created_at, Table.id)))
        .scalars()
        .all()
    )
    areas = (
        (await db.execute(select(Area).where(Area.layout_id == layout.id).order_by(Area.created_at, Area.id)))
        .scalars()
        .all()
    )
    room = await db.get(Room, layout.room_id)
    if room is None:
        raise NotFoundError(f"Room '{layout.room_id}' not found.")
    table_type_ids = {t.table_type_id for t in tables}
    table_types: dict[str, TableType] = {}
    if table_type_ids:
        result = await db.execute(select(TableType).where(TableType.id.in_(table_type_ids)))
        table_types = {tt.id: tt for tt in result.scalars().all()}

    return {
        "tables": [
            {
                "id": t.id,
                "name": t.name,
                "x": t.x,
                "y": t.y,
                "rotation": t.rotation,
                "table_type_id": t.table_type_id,
                "table_type_name": table_types[t.table_type_id].name,
                "capacity": table_types[t.table_type_id].capacity,
                "width_m": table_types[t.table_type_id].width_m,
                "length_m": table_types[t.table_type_id].length_m,
            }
            for t in tables
        ],
        "areas": [
            {
                "id": a.id,
                "label": a.label,
                "icon": a.icon,
                "x": a.x,
                "y": a.y,
                "rotation": a.rotation,
                "width_m": a.width_m,
                "length_m": a.length_m,
            }
            for a in areas
        ],
        "room": {"width_m": room.width_m, "length_m": room.length_m},
    }


async def save_layout_revision(
    db: AsyncSession,
    *,
    actor: str,
    layout_id: str,
    body: LayoutRevisionSaveRequest,
    request_id: str | None = None,
) -> LayoutRevisionOut:
    layout = await db.get(Layout, layout_id)
    if layout is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    # Lock the parent Layout row so two concurrent saves for the same layout
    # serialize rather than racing to compute the same MAX(revision_number)+1
    # (mirrors policies_service._get_policy_locked / create_draft). Locks by
    # bare id column, not the mapped entity: Layout.event is a joined eager
    # relationship, and Postgres refuses FOR UPDATE on an outer-joined SELECT.
    await db.execute(select(Layout.id).where(Layout.id == layout_id).with_for_update())

    highest = (
        await db.execute(select(func.max(LayoutRevision.revision_number)).where(LayoutRevision.layout_id == layout_id))
    ).scalar_one()
    snapshot = await _build_snapshot(db, layout)

    revision = LayoutRevision(
        id=make_id("layrev"),
        layout_id=layout_id,
        revision_number=1 if highest is None else highest + 1,
        label=body.label.strip(),
        change_note=body.change_note,
        created_by=actor,
        snapshot=snapshot,
    )
    db.add(revision)
    await write_audit_entry(
        db,
        actor=actor,
        action="layout_revision_saved",
        resource_type="layout_revision",
        resource_id=revision.id,
        request_id=request_id,
        details={"layout_id": layout_id, "revision_number": revision.revision_number},
    )
    await db.commit()
    await db.refresh(revision)
    labels = await labels_by_actor(db, [revision.created_by])
    return _revision_to_out(revision, labels[revision.created_by])


async def list_layout_revisions(db: AsyncSession, layout_id: str) -> list[LayoutRevisionOut]:
    if await db.get(Layout, layout_id) is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    result = await db.execute(
        select(LayoutRevision)
        .where(LayoutRevision.layout_id == layout_id)
        .order_by(LayoutRevision.revision_number.desc())
    )
    revisions = result.scalars().all()
    labels = await labels_by_actor(db, (rev.created_by for rev in revisions))
    return [_revision_to_out(rev, labels[rev.created_by]) for rev in revisions]


async def _get_revision(db: AsyncSession, layout_id: str, revision_number: int) -> LayoutRevision:
    rev = (
        await db.execute(
            select(LayoutRevision).where(
                LayoutRevision.layout_id == layout_id, LayoutRevision.revision_number == revision_number
            )
        )
    ).scalar_one_or_none()
    if rev is None:
        raise NotFoundError(f"Layout '{layout_id}' has no revision {revision_number}.")
    return rev


async def get_layout_revision(db: AsyncSession, layout_id: str, revision_number: int) -> LayoutRevisionOut:
    revision = await _get_revision(db, layout_id, revision_number)
    labels = await labels_by_actor(db, [revision.created_by])
    return _revision_to_out(revision, labels[revision.created_by])


async def _resolve_snapshot(db: AsyncSession, layout_id: str, ref: str) -> dict:
    """Resolve a compare/preview ref to a snapshot-shaped dict: either a stored
    revision's snapshot, or a freshly-built view of the live ``current`` layout."""
    if ref == CURRENT_REVISION_REF:
        layout = await db.get(Layout, layout_id)
        if layout is None:
            raise NotFoundError(f"Layout '{layout_id}' not found.")
        return await _build_snapshot(db, layout)
    try:
        revision_number = int(ref)
    except ValueError:
        raise ValidationFailedError(
            f"Invalid revision reference '{ref}': expected an integer revision number or '{CURRENT_REVISION_REF}'."
        ) from None
    return (await _get_revision(db, layout_id, revision_number)).snapshot


def _diff_objects(before: list[dict], after: list[dict], fields: tuple[str, ...]) -> tuple[list, list, list]:
    """Match ``before``/``after`` snapshot entries by stable ``id`` (never by
    the mutable ``name``/``label``) and report additions, removals, and
    field-level changes."""
    before_by_id = {item["id"]: item for item in before}
    after_by_id = {item["id"]: item for item in after}
    added = [item for item in after if item["id"] not in before_by_id]
    removed = [item for item in before if item["id"] not in after_by_id]
    changed = []
    for object_id, before_item in before_by_id.items():
        after_item = after_by_id.get(object_id)
        if after_item is None:
            continue
        changes = [
            {"field": field, "before": before_item[field], "after": after_item[field]}
            for field in fields
            if before_item[field] != after_item[field]
        ]
        if changes:
            changed.append({"id": object_id, "before": before_item, "after": after_item, "changes": changes})
    return added, removed, changed


async def compare_layout_revisions(db: AsyncSession, layout_id: str, from_ref: str, to_ref: str) -> LayoutRevisionDiff:
    if await db.get(Layout, layout_id) is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    from_snapshot = await _resolve_snapshot(db, layout_id, from_ref)
    to_snapshot = await _resolve_snapshot(db, layout_id, to_ref)

    added_tables, removed_tables, changed_tables = _diff_objects(
        from_snapshot["tables"], to_snapshot["tables"], _TABLE_DIFF_FIELDS
    )
    added_areas, removed_areas, changed_areas = _diff_objects(
        from_snapshot["areas"], to_snapshot["areas"], _AREA_DIFF_FIELDS
    )
    return LayoutRevisionDiff(
        layout_id=layout_id,
        from_ref=from_ref,
        to_ref=to_ref,
        added_tables=added_tables,
        removed_tables=removed_tables,
        changed_tables=changed_tables,
        added_areas=added_areas,
        removed_areas=removed_areas,
        changed_areas=changed_areas,
    )


async def _allocation_conflicts(
    db: AsyncSession,
    *,
    current_tables_by_id: dict[str, dict],
    tables_to_remove: list[dict],
    tables_to_update: list[dict],
    areas_to_remove: list[dict],
    areas_to_update: list[dict],
) -> list[dict]:
    """Live allocations a restore would silently orphan: a table being deleted
    or having its geometry/type changed, or an area being deleted, while still
    holding a non-cancelled registration/organization assignment. Restoring never
    touches ``Registration``/``Area.organization_id`` itself — this only flags the
    conflict so the caller can make a deliberate ``resolve_allocations`` call."""
    removed_ids = {t["id"] for t in tables_to_remove}
    moved_ids = {t["id"] for t in tables_to_update if any(c["field"] in _GEOMETRY_TABLE_FIELDS for c in t["changes"])}
    at_risk_table_ids = removed_ids | moved_ids

    conflicts: list[dict] = []
    if at_risk_table_ids:
        rows = (
            await db.execute(
                select(Registration.id, RegistrationAllocation.table_id)
                .join(RegistrationAllocation, RegistrationAllocation.registration_id == Registration.id)
                .where(
                    RegistrationAllocation.table_id.in_(at_risk_table_ids),
                    Registration.status != "cancelled",
                )
            )
        ).all()
        registration_ids_by_table_id: dict[str, list[str]] = {}
        for registration_id, table_id in rows:
            registration_ids_by_table_id.setdefault(table_id, []).append(registration_id)
        for table_id, registration_ids in registration_ids_by_table_id.items():
            conflicts.append(
                {
                    "kind": "table",
                    "id": table_id,
                    "name": current_tables_by_id[table_id]["name"],
                    "reason": "deleted" if table_id in removed_ids else "moved",
                    "registration_ids": sorted(registration_ids),
                }
            )

    removed_area_ids = {a["id"] for a in areas_to_remove}
    moved_area_ids = {
        a["id"] for a in areas_to_update if any(c["field"] in _GEOMETRY_AREA_FIELDS for c in a["changes"])
    }
    at_risk_area_ids = removed_area_ids | moved_area_ids
    if at_risk_area_ids:
        rows = (
            await db.execute(
                select(Area.id, Area.organization_id, Area.label).where(
                    Area.id.in_(at_risk_area_ids), Area.organization_id.isnot(None)
                )
            )
        ).all()
        for area_id, organization_id, label in rows:
            conflicts.append(
                {
                    "kind": "area",
                    "id": area_id,
                    "name": label,
                    "reason": "deleted" if area_id in removed_area_ids else "moved",
                    "organization_id": organization_id,
                }
            )
    return conflicts


async def _build_restore_plan(db: AsyncSession, layout: Layout, revision: LayoutRevision) -> LayoutRestorePreview:
    current_snapshot = await _build_snapshot(db, layout)
    target_snapshot = revision.snapshot

    tables_to_add, tables_to_remove, tables_to_update = _diff_objects(
        current_snapshot["tables"], target_snapshot["tables"], _TABLE_DIFF_FIELDS
    )
    areas_to_add, areas_to_remove, areas_to_update = _diff_objects(
        current_snapshot["areas"], target_snapshot["areas"], _AREA_DIFF_FIELDS
    )
    conflicts = await _allocation_conflicts(
        db,
        current_tables_by_id={t["id"]: t for t in current_snapshot["tables"]},
        tables_to_remove=tables_to_remove,
        tables_to_update=tables_to_update,
        areas_to_remove=areas_to_remove,
        areas_to_update=areas_to_update,
    )
    return LayoutRestorePreview(
        layout_id=layout.id,
        revision_number=revision.revision_number,
        tables_to_add=tables_to_add,
        tables_to_update=tables_to_update,
        tables_to_remove=tables_to_remove,
        areas_to_add=areas_to_add,
        areas_to_update=areas_to_update,
        areas_to_remove=areas_to_remove,
        allocation_conflicts=conflicts,
        has_conflicts=bool(conflicts),
    )


async def preview_layout_restore(db: AsyncSession, layout_id: str, revision_number: int) -> LayoutRestorePreview:
    layout = await db.get(Layout, layout_id)
    if layout is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    revision = await _get_revision(db, layout_id, revision_number)
    return await _build_restore_plan(db, layout, revision)


async def restore_layout_revision(
    db: AsyncSession,
    *,
    actor: str,
    layout_id: str,
    revision_number: int,
    resolve_allocations: bool = False,
    request_id: str | None = None,
) -> LayoutOut:
    layout = await db.get(Layout, layout_id)
    if layout is None:
        raise NotFoundError(f"Layout '{layout_id}' not found.")
    # Lock the parent Layout row: the plan computed below and the mutations
    # applied afterward must see (and hold against) one consistent state. See
    # save_layout_revision for why this locks the bare id column rather than
    # the mapped entity.
    await db.execute(select(Layout.id).where(Layout.id == layout_id).with_for_update())
    revision = await _get_revision(db, layout_id, revision_number)
    snapshot = revision.snapshot

    table_type_ids = {t["table_type_id"] for t in snapshot["tables"]}
    if table_type_ids:
        existing_type_ids = set(
            (await db.execute(select(TableType.id).where(TableType.id.in_(table_type_ids)))).scalars().all()
        )
        missing_type_ids = table_type_ids - existing_type_ids
        if missing_type_ids:
            raise ValidationFailedError(
                f"Cannot restore: table type(s) {sorted(missing_type_ids)} referenced by this revision no longer exist."
            )

    # Lock every current table/area for this layout *before* computing the
    # restore plan below. A concurrent write to one of these rows (a new
    # table allocation — see allocations_service.validate_allocations's own
    # explicit lock — or a plain UPDATE from areas_service assigning an
    # organization) contends for the same Postgres row lock either way, so
    # acquiring it first guarantees the conflict check and the mutations
    # further down see one consistent, serialized state — nothing can commit
    # a new allocation between "we decided this is safe" and "we changed it".
    current_tables = {
        t.id: t
        for t in (await db.execute(select(Table).where(Table.layout_id == layout_id).with_for_update())).scalars().all()
    }
    current_areas = {
        a.id: a
        for a in (await db.execute(select(Area).where(Area.layout_id == layout_id).with_for_update())).scalars().all()
    }

    plan = await _build_restore_plan(db, layout, revision)
    if plan.allocation_conflicts and not resolve_allocations:
        raise ConflictError(
            "Restoring this revision would delete or move table(s)/area(s) with live "
            "allocations. Pass resolve_allocations=true to restore anyway."
        )

    snapshot_table_ids = {t["id"] for t in snapshot["tables"]}
    snapshot_area_ids = {a["id"] for a in snapshot["areas"]}

    tables_being_removed = [table_id for table_id in current_tables if table_id not in snapshot_table_ids]
    if tables_being_removed:
        # RegistrationAllocation.table_id is ON DELETE RESTRICT (a table can
        # normally never be deleted out from under a live booking — see
        # tables_service.delete_table): clear any allocation rows first so the
        # delete below doesn't hit that constraint. Live (non-cancelled)
        # allocations only reach here at all because the caller already
        # confirmed the conflict via resolve_allocations=True above; a
        # cancelled registration's stale allocation row is cleared either way
        # — its Registration row itself is never touched.
        await db.execute(
            delete(RegistrationAllocation).where(RegistrationAllocation.table_id.in_(tables_being_removed))
        )
    for table_id in tables_being_removed:
        await db.delete(current_tables[table_id])
    for area_id, area in current_areas.items():
        if area_id not in snapshot_area_ids:
            await db.delete(area)
    # Flush the deletes before checking id availability below — otherwise a
    # just-deleted row is still visible via db.get() (pending in the
    # identity map until flushed), and a recreate would wrongly mint a new id
    # instead of reusing the one this same restore just freed.
    await db.flush()

    for entry in snapshot["tables"]:
        existing = current_tables.get(entry["id"])
        if existing is not None:
            existing.name = entry["name"]
            existing.x = entry["x"]
            existing.y = entry["y"]
            existing.rotation = entry["rotation"]
            existing.table_type_id = entry["table_type_id"]
        else:
            reused_id = entry["id"] if await db.get(Table, entry["id"]) is None else make_id("tbl")
            db.add(
                Table(
                    id=reused_id,
                    name=entry["name"],
                    x=entry["x"],
                    y=entry["y"],
                    rotation=entry["rotation"],
                    table_type_id=entry["table_type_id"],
                    layout_id=layout_id,
                )
            )

    for entry in snapshot["areas"]:
        existing = current_areas.get(entry["id"])
        if existing is not None:
            existing.label = entry["label"]
            existing.icon = entry["icon"]
            existing.x = entry["x"]
            existing.y = entry["y"]
            existing.rotation = entry["rotation"]
            existing.width_m = entry["width_m"]
            existing.length_m = entry["length_m"]
        else:
            reused_id = entry["id"] if await db.get(Area, entry["id"]) is None else make_id("area")
            db.add(
                Area(
                    id=reused_id,
                    layout_id=layout_id,
                    label=entry["label"],
                    icon=entry["icon"],
                    x=entry["x"],
                    y=entry["y"],
                    rotation=entry["rotation"],
                    width_m=entry["width_m"],
                    length_m=entry["length_m"],
                )
            )

    await write_audit_entry(
        db,
        actor=actor,
        action="layout_revision_restored",
        resource_type="layout_revision",
        resource_id=revision.id,
        request_id=request_id,
        details={
            "layout_id": layout_id,
            "revision_number": revision_number,
            "resolve_allocations": resolve_allocations,
        },
    )
    await db.commit()
    return await get_layout(db, layout_id, include_tables=True)
