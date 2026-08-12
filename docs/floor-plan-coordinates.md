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

```
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

## Scope

This document covers the coordinate and scoped-read contract addressed by issue #834.
The deeper event/day layout key (`Layout.day_id`/`edition_id` resolution) and the
seating/reservation assignment model are issue #802's territory.
