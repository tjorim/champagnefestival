# Exhibitor logo uploads (#1194)

Managers upload from **My account** using the existing verified contact identity.
An upload adds an `image` field to the private proposal workflow from #1193,
retaining the other currently proposed fields. A new upload replaces that
proposal and its private file. Submitting a replacement text-only proposal
also discards the previous logo proposal. Admin review shows the current public
logo and the authenticated proposed logo side by side.

Administrators can upload directly in the existing exhibitor editor after the
exhibitor has been created. The upload publishes immediately; its help text
makes this explicit. Direct REST/MCP image-path edits likewise supersede a
manager's proposed logo. Other pending fields remain available for review.
Existing image paths and external URLs continue to work and are never deleted
from external storage. Managed upload paths cannot be assigned to another
exhibitor by pasting them into the path field; use an upload instead.

## Validation and storage

The multipart `file` must declare PNG, JPEG or WebP and actually decode as that
format. SVG, corrupt images, MIME mismatches and animations are rejected. The
limits are 5 MiB of input and 16,000,000 input pixels. EXIF orientation is applied
before resizing to fit 2,048 × 2,048 pixels. A fresh PNG is encoded without
source metadata. Filenames contain an independent UUID and SHA-256 of the
encoded image; user-provided filenames never enter filesystem paths. Identical
uploads have separate ownership so deleting one cannot break another.

Configure `EXHIBITOR_LOGO_PUBLIC_ROOT` and `EXHIBITOR_LOGO_PENDING_ROOT`. Defaults
relative to the backend working directory are `./uploads/public/exhibitors`
and `./uploads/pending/exhibitors`. Neither root may contain the other.
The accepted URL is `/uploads/exhibitors/<uuid>-<sha256>.png`.
The backend serves this route locally (Vite proxies `/uploads`); production
Caddy should serve only the public root, with PNG content type and
`X-Content-Type-Options: nosniff`. Keep the pending root outside any public web
root. Persistent volumes, Caddy configuration and backups remain the separate
`tjorim/apps#262` deployment prerequisite.

Files are prepared before committing the new database reference. Obsolete
files are removed only after commit; rollback/session close removes newly
created files and preserves old files. Rejection, replacement, supersession
and exhibitor deletion all retire private files. Acceptance copies into the
public root, commits the live reference, then deletes the private and previous
managed public files. There is no rollback retention window for old logos.

After a process crash or a logged filesystem deletion failure, run from
`backend/` with the same database/storage configuration:

```sh
uv run python -m app.services.exhibitor_logos
```

This removes unreferenced managed files from both roots. Recovery and logo
mutations share a PostgreSQL transaction advisory lock, so recovery cannot
race an in-flight upload or acceptance. Run after restart and periodically as
an operational recovery job. Back up the database and both roots together.
History retains the decision and filename, but previews exist only while a
logo remains pending. Storage must be writable by the API process; I/O failures
fail the operation, and deletion failures are logged for reconciliation.

## API

All uploads use multipart form data with the field `file`:

- `POST /api/me/exhibitors/{id}/logo`: current verified contact only; returns
  `ExhibitorChangeOut`. Creates a private proposal, never changes live `image`.
- `POST /api/exhibitors/{id}/logo`: administrator only; returns `ExhibitorOut`.
  Publishes immediately and supersedes the pending `image` field.
- `GET /api/me/exhibitors/{id}/changes/{change_id}/logo`: current contact only.
- `GET /api/exhibitors/changes/{change_id}/logo`: administrator only.
- `POST /api/exhibitors/changes/{change_id}/decision`: existing administrator
  accept/reject API, now also handles logo promotion and cleanup (including MCP).
- `GET /uploads/exhibitors/{name}`: public PNGs only; pending filenames return 404.

Private preview responses use `Cache-Control: no-store`, `image/png` and
`nosniff`. Bearer-authenticated UI previews fetch a blob and revoke its object
URL on unmount. Errors are 415 for unsupported MIME type, 413 for input size or
pixel limits, 400 for invalid images, and 404 for unavailable/unauthorised
manager resources. Member/volunteer status alone gives no upload or review
rights; a verified current contact may act as a manager regardless of staff role.

## Verification

`backend/tests/test_exhibitor_logos.py` covers validation, private previews,
publication/replay, replacement/rejection/admin overrides, deletion, rollback
and orphan reconciliation. Frontend component tests cover multipart submission,
visible errors and authenticated preview URL lifecycle alongside proposal review.

Final local verification: 1,424 backend tests, 983 frontend tests and 276
Chromium E2E tests pass. Backend/frontend lint, formatting and type checks,
the frontend production build and migration from an empty database through
Alembic head pass. A browser component check also confirms both review images
load, no horizontal overflow at 390 pixels and a successful multipart upload.

## Acceptance record (2026-10-07)

- [x] Manager upload stays private until administrator acceptance; both logos are shown together in review.
- [x] Administrator upload publishes immediately and supersedes the pending logo.
- [x] MIME, size, corruption, pixel and SVG rejection are covered; stored uploads are fresh PNGs.
- [x] Accept, reject, replace, supersede and exhibitor deletion retire obsolete files; rollback and crash recovery are tested.
- [x] Existing public paths and URLs keep rendering through `ResponsiveImage`.
- [x] Retry safety, README, configuration example and API documentation describe the new writes.

Production rollout awaits the persistent volumes, Caddy route and backups in
`tjorim/apps#262`; it is not represented as a completed deployment here.
