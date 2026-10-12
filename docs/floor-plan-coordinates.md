# Floor-plan coordinate contract

This document defines the coordinate system used by `Table.x`/`Table.y`/`Table.rotation`
and `Area.x`/`Area.y`/`Area.rotation` — the fields that place a table or area on a
floor-plan `Layout`. It is the single source of truth referenced by the model
docstrings (`backend/app/models.py`), the Pydantic schema field descriptions
(`backend/app/schemas.py`), the MCP tool docstrings (`backend/app/mcp_server.py`),
and the web admin floor-plan editor (`frontend/src/components/admin/LayoutEditor.tsx`).

It does **not** cover `Room.width_m`/`length_m`, `TableType.width_m`/`length_m`, or
`Area.width_m`/`length_m` — those are real physical measurements in metres (see #835)
and are independent of the `x`/`y`/`rotation` contract described here. It also does not
cover `Layout.day_id`/`edition_id` resolution or seating/reservation assignment — see
issue #802 for that.

## Position (`x`, `y`)

- **Type:** float, range `[0, 100]` inclusive — enforced by `TableCreate`/`TableUpdate`/
  `AreaCreate`/`AreaUpdate` in `backend/app/schemas.py`. A value outside this range is
  rejected (422 over REST, `ValueError` over MCP) rather than clamped or silently stored.
- **Unit:** a **percentage of the layout's rendered canvas** — not the room's physical
  `width_m`/`length_m` directly, and not raw pixels or metres.
- **Origin:** the top-left corner of the canvas is `(0, 0)`. `x` increases rightward,
  `y` increases downward.
- **Anchor point:** the top-left corner of the table's/area's own rendered bounding box
  (not its center).

### Canvas size

The canvas a percentage is relative to is *derived* from the room's `width_m`/`length_m`,
not used verbatim:

```text
canvas_width_px  = max(280, room.width_m  * 28)
canvas_height_px = max(180, room.length_m * 28)
```

The `28` px/metre scale and the `280`/`180` px minimums originate in
`frontend/src/utils/layoutUtils.ts` (`LAYOUT_PX_PER_M`, `LAYOUT_MIN_CANVAS_WIDTH_PX`,
`LAYOUT_MIN_CANVAS_HEIGHT_PX`) and are intentionally mirrored — same constants, same
rounding — in `backend/app/services/layouts_service.py` (`_PX_PER_M`,
`_MIN_CANVAS_WIDTH_PX`, `_MIN_CANVAS_HEIGHT_PX`, `_js_round`) so the backend's
area-containment check (used when copying a layout) agrees with what the editor renders.

**Because of the minimum floor, a small room's canvas can be wider/taller than
`width_m * 28`px** — e.g. a 5m-wide room still gets a 280px-wide canvas, not 140px. For
rooms under roughly 10m × 6.4m, `x`/`y` are therefore *not* a clean percentage of the
room's physical dimensions. Treat `x`/`y` as canvas-relative, always — never derive a
metre position from them without applying this formula first.

## Rotation

- **Type:** integer degrees, range `[0, 359]` inclusive.
- **Direction:** clockwise.
- **Pivot:** the element's own center (CSS `transform: rotate(Ndeg)` around the default
  `transform-origin: center`), matching `LayoutEditor.tsx`.

## Out-of-bounds handling

`x`, `y`, and `rotation` are range-checked at the schema layer on every write path — REST,
MCP admin tools, and layout-copy (which clones existing values as-is, so a row that
predates this contract can't silently violate it once touched again). An out-of-range
value is rejected consistently across all three surfaces; there is no separate
normalization path.

The web editor additionally clamps drag operations so an element's *bounding box* never
extends past the canvas edge — that stricter bound depends on the referenced table
type's/area's own physical width/length (via `getTableSizePx`/`getAreaSizePx`), so it is a
rendering-time constraint the editor enforces on the user's behalf, not part of the
`[0, 100]` wire contract enforced by the schema.

## Public stand subset

`GET /api/editions/{edition_id}/stands` (unauthenticated, `Cache-Control: public,
max-age=60`; MCP `find_stand`) publishes only the *labels* of areas that carry an
`organization_id`, never geometry or anything from the seating plan. Per active
organization (any type, lineup or not) with a stand in the edition's plans it returns `stands: [{event_id, date, room_name, label}]`:
one entry per day/room the organization has an area, from active events only, for active
organizations only. `x`, `y`, `rotation`, sizes, icons, layout/area ids, tables,
registrations, guests, capacities and allocations are deliberately absent, so the
coordinate contract above does not apply to the stand list; the floor plan below is its own
privacy-reviewed payload. Stands are only published while the festival is on: from the
first active event day through `STANDS_VISIBLE_DAYS_AFTER` (7) days after the last one,
by Europe/Brussels date. Outside that window `organizations` is empty (organizers may
still be moving people around beforehand, and the list is stale afterwards). Inside it
there is no publish flag, so stands appear as soon as they are assigned. An inactive
edition returns 404.

## Public floor plan subset

`GET /api/editions/{edition_id}/plan` (unauthenticated, `Cache-Control: public,
max-age=60`; #1253) publishes the geometry of the same plans for the homepage's "Show on
plan" view. It has its own response model (`EditionPlanOut`) and is built by
`load_edition_plan` in `app/services/stands_service.py`, which loads only rooms and areas
and never `Layout.tables`, so nothing from the seating plan can reach it. The shape is
`days: [{event_id, date, rooms: [{id, name, width_m, length_m, color, areas: [{id, label,
icon, x, y, rotation, width_m, length_m, organization_id}]}]}]`:

- **Which areas:** every area of an active event, including those without an organization
  (stage, entrance, catering, ...) so visitors can orient themselves. Areas owned by an
  inactive organization are omitted, as in the stand list.
- **Which rooms and days:** active event days in date order; a room appears only when it has
  at least one published area.
- **Tables:** never. There are no table shapes, registrations, guests, capacities,
  allocations or layout ids; `tests/test_edition_plan.py` asserts their absence.
- **Window:** the same as the stand list (first active event day through
  `STANDS_VISIBLE_DAYS_AFTER` days after the last one, Europe/Brussels); `days` is empty
  outside it and an inactive edition returns 404.
- **Rendering:** `x`/`y`/`rotation` follow the contract above. The frontend
  (`PublicFloorPlanDialog`) converts each area's pixel size to a percentage of the room
  canvas (`planAreaBox` in `frontend/src/utils/planApi.ts`) so the plan scales with its
  container, and keeps the canvas's natural size as a minimum so it scrolls sideways on a
  phone instead of shrinking labels.
- **Not exposed elsewhere:** the public MCP does not get the plan; `find_stand` already
  answers "where is X?". Printing the placemats from this data stays an admin concern.

## Scope

This document covers the coordinate and scoped-read contract addressed by issue #834.
The deeper event/day layout key (`Layout.day_id`/`edition_id` resolution) and the
seating/reservation assignment model are issue #802's territory.
