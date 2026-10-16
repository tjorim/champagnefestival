# Signage API (#1261)

## Scope and clock contract

Channels explicitly reference one edition. Changing the active festival edition does
not silently change a screen. A channel may remain active while its edition is
inactive (for preparation and replay); disabling the channel returns 404 publicly.

The channel epoch is assigned in UTC on creation and remains fixed through edits.
This resolves #1261's epoch choice in favour of its fixed-epoch alternative.
The public `revision` is a SHA-256 content identifier for the exact public cycle
(epoch and ordered, expanded slides, including localised content and templates).
It is distinct from the admin channel's monotonically increasing edit counter.
Organisation name/logo/activity, tier, translation, template and schedule changes
therefore change the public revision without needing a signage write. Identical
public revisions always describe identical cycles. Empty playlists are valid.

The player (#1262) computes `(serverNow - epoch) mod sum(duration)` using the
clock endpoint. This API does not retain prior playlist snapshots or announce a
future activation boundary: a fixed epoch alone does not make devices fetching
different revisions switch simultaneously. The player must handle revision
transitions; coordinated future activation would require an additional versioned
snapshot contract. Do not claim cycle-boundary switching is implemented here.

## Public reads (no authentication)

- `GET /api/signage/time` → `{"server_time": "<UTC ISO timestamp>"}`;
  `Cache-Control: no-store`.
- `GET /api/signage/{slug}/playlist?locale=nl|fr|en` (default `nl`) →
  `{revision, epoch, slides}`. Each slide has a stable `id`, `kind`, integer
  `duration` in seconds, a `{background, layers}` template, optional localised
  `text`/`title`, original/translated `translations`, `image`, `icon`, and an
  optional `organization: {name, logo, description, sponsor, sponsor_tier}`.
  No channel/edition configuration, contact, stand, room, seating, registration,
  audit or other admin fields are returned. The response models explicitly
  enumerate allowed fields; integration tests recursively check privacy.
- `ETag` is the quoted public revision. Weak and strong `If-None-Match` validators
  (or `*`) return an empty 304 with cache headers. Cache is public for at most
  five seconds, capped at the next active slide's schedule edge (rounded down).
  Unknown/inactive channels return 404 with `code=signage_not_found`.

Slides sort by `sort_order`, then stable id. Only active slides with
`starts_at <= now < ends_at` are included (missing bounds are unbounded).
An `organizations` slide expands to one slide per active organisation: producers
alphabetically, vendors alphabetically, sponsors by main/partner/supporter/untiered
then edition lineup order. Producers/sponsors come from the edition lineup;
vendors come from areas assigned to the edition's active events, deduplicated
across layouts. Stand geometry and labels are never projected. Text and
organisation descriptions fall back to their original language. Manual text is
limited to 500 characters per language, titles to 120. The original language
defaults to `en`, as with other translated content. The translations are also
returned so the player can stack languages without another fetch.

## Administrative writes (require_admin)

For each of `channels`, `templates`, `slides` under `/api/signage`:

- `GET /{resource}` and `GET /{resource}/{id}` list/read configurations.
- `POST /{resource}` creates (201); `PUT /{resource}/{id}` fully replaces editable
  fields (200); `DELETE /{resource}/{id}` deletes (204).

Channels accept `{slug, name, edition_id, active}` (default inactive). Templates
accept `{name, background, layers}`. Slides accept `{channel_id, template_id,
sort_order, kind, duration, active, starts_at, ends_at, content}`. Default duration
is 10 seconds, range 1–3600; slides default inactive. `kind` is `organizations`,
`notice` or `image`. Notices require original-language text; images require an
uploaded image. UTC offsets are mandatory on schedule timestamps. Unknown fields,
invalid schedules, layer documents and text lengths return 422.

`POST /api/signage/channels/{id}/reorder` takes `{ordered_ids: [...]}`, containing
every slide in that channel exactly once; an empty channel accepts an empty list.
It atomically assigns zero-based positions. All signage mutations are serialised
by a transaction-scoped PostgreSQL advisory lock and audited in the same commit.
Deleting a channel cascades its slides; deleting a referenced template returns
409. Referenced editions cannot be deleted while a channel uses them.

Stable business error codes: `signage_not_found`, `signage_edition_not_found`,
`signage_conflict` (duplicate slug/reference race), `signage_in_use` (template
still referenced), `signage_invalid_order`, `signage_invalid_image`, and
`signage_asset_not_found`, and `signage_missing_placeholders` (422 when a slide
uses an incomplete template or an edit removes required bindings). Standard request validation and authentication retain
the existing API conventions. Retry decisions: [retry-safety.md](retry-safety.md).

## Canvas and image assets

Canvas coordinates are percentages on a 1920×1080 reference canvas. `x`/`y`
mark the layer top-left corner, rotation is clockwise around its centre, width/height
are percentages. Array order is paint order. Layers support `binding`, `text`,
`image`, `icon`, `shape`; bindings are `logo`, `name`, `description`, `sponsor`,
`title`, `text`, `icon`. Documents reject arbitrary CSS/HTML and unknown keys;
colours are six-digit hex, geometry is bounded and finite. Backgrounds support
`color`, a two-colour `gradient`, or uploaded `image`. Exact defaults and bounds
are published by OpenAPI (`/docs`, `/openapi.json`). The
[layer contract](signage-layer-contract.md) describes editor metadata, typography,
image fit and required bindings.

`POST /api/signage/assets` accepts multipart `file`. It reuses edition hero
validation: PNG/JPEG/WebP, static only, 10 MiB/40 megapixel limits, landscape
ratio 1.5–2.4 and minimum 1200×500, downscaled to 2400×1600 and re-encoded as a
metadata-free JPEG. Its `{url}` can be used by slides, backgrounds or image
layers. Storage uses the existing transaction-aware image store: failed commits
remove the newly written file. Names have a random component and content hash;
repeating an upload creates a new URL. Successful assets are retained for reuse;
there is no automatic orphan collection or asset deletion in this increment.

Files live in `EDITION_ARTWORK_PUBLIC_ROOT/signage/` and are served at
`/uploads/signage/{name}` with immutable caching and `nosniff`. The application
serves these routes itself; production must proxy `/uploads/signage/*` to the
backend or map this URL prefix to that directory in Caddy. Edition artwork's
reconciler ignores the signage subdirectory. Database backups alone do not
include uploaded files; preserve the artwork storage volume too.
