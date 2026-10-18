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

## Private MP4 exports (#1349)

Migration `008` adds server-owned `signage_video_exports`. Every endpoint below
requires a current admin session; reads, writes and downloads are additionally
scoped to the initiating OIDC subject (another admin receives 404). Responses
are private/no-store. No worker credential, worker ID or artifact URL is exposed.

- `GET /api/signage/video-exports/capability` reports `available`, `max_slides`
  (60) and `max_seconds` (600). Available means the explicit worker origin and
  readable credential file are configured; it is not a worker health promise.
- `POST /api/signage/video-exports`, with `Idempotency-Key` (16–128 ASCII
  letters/digits/underscore/hyphen) and `{channel_id, locale}` (locale defaults
  to `nl`), records the active channel's current published playlist, revision,
  epoch and expanded organisation/translation/schedule projection. It returns
  job metadata and `playlist` for capture. Empty/over-limit cycles fail before
  capture; drafts and later channel edits never enter this snapshot.
- `PUT /api/signage/video-exports/{id}/slides/{index}` uploads raw `image/png`
  bytes into a zero-based immutable slot. Each upload has a 30-second deadline,
  8 MiB ceiling and real single-frame PNG decode/1920×1080 validation; the entire
  set is at most 120 MiB. Filenames/URLs/durations/order cannot be uploaded or
  overridden. Pixels are accepted as admin-authored output, not claimed to be
  server-verified equivalents of the renderer. No remote input fetching occurs.
- `POST /api/signage/video-exports/{id}/submit` checks the complete ordered set,
  persists its canonical SHA256 digest and changes to `submitted` atomically.
  Encoding never holds this HTTP request open. The browser may close afterwards.
- `GET /api/signage/video-exports` lists up to 100 of the creator's jobs, prioritising pending/downloadable work before recent history;
  `GET /api/signage/video-exports/{id}` reads one. States: `preparing`,
  `submitted`, `queued`, `running`, `ready`, `failed`, `cancelled`, `expired`.
  Metadata includes channel name, locale, cycle length/count and absolute app
  expiry. `retrying` explains temporary worker outages without encoder details.
- `POST /api/signage/video-exports/{id}/cancel` requests cancellation/removal,
  immediately hides the download and is safe to repeat. A remote pass already
  holding the row lock can delay this request by up to its 125-second bound.
- `GET /api/signage/video-exports/{id}/download` streams only a ready, unexpired
  private MP4 (160 MiB maximum, 120-second transfer deadline, no Range support).
  Repeated downloads have no write/publication effect. Worker hashes and sizes
  are verified before committing readiness, and worker outputs are acknowledged
  only in a subsequent reconciliation pass after that commit.

Stable application errors use `signage_video_` with `unavailable`, `not_found`,
`invalid_key`, `playlist_limit`, `capacity`, `conflict`, `incomplete`,
`invalid_image`, `input_limit`, or `not_ready`. The interface uses translated
operation guidance, never backend/encoder diagnostics.

Each API process runs a lifespan reconciler; a Postgres advisory transaction lock
allows one remote pass globally, with row locking against uploads, cancellation
and channel deletion. Each pass is bounded to 125 seconds, status polling is
scheduled at least 3 seconds apart (15 seconds on outages). API restart does not
lose job identity. Same-key/digest replay resolves uncertain worker acceptance;
there is no local encoder fallback. The worker ID commits in a separate pass
before status/artifact use. ACK retries cannot duplicate local completion.

Storage is an operator-configured **private persistent volume**, shared by all
API replicas. Files/directories are mode 0600/0700, atomically replaced and
fsynced. Admission allows at most two preparing/encoding jobs and six total
active/retained jobs globally, with 480 MiB minimum free disk at creation. Reserve
at least 2 GiB for app staging/artifacts and monitor it separately from worker
spool storage. The output is silent 30 fps H.264/yuv420p, faststart, one cycle;
the worker rounds cumulative boundaries within half a frame.

App downloads expire **24 hours after snapshot creation**, independently of the
worker's completion-based retention. Local expired/cancelled bytes are cleaned by a separate 30-second batch loop
even when credentials are disabled or remote submission/ACK requests are
blocked. Cleanup skips rows held by a remote pass (at most 125 seconds) and
retries filesystem failures; API downtime defers cleanup until startup. Channel deletion sets
the retained job's FK to null, denies downloads immediately and schedules remote
cancellation/cleanup. Revoked admins cannot read/cancel/download; their jobs
still expire automatically. A job with missing app/worker artifacts becomes
`expired`; start a new explicit export. Successfully acknowledged app artifacts
remain available until app expiry even though worker status is then expired.

After app expiry, content/upload/artifact metadata is reduced to a compact
identity/duration tombstone. Retry identity rows remain indefinitely to outlive
the worker's seven-day deduplication window. No expired job is resubmitted with
bytes: uncertain submissions use a bodyless lookup, and even that stops before
six days. A new encode always requires a new explicit app job. Interrupted
browser preparation is cancellable from the list; cancel it and start again.
