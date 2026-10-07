# Organisation logo uploads (#1194)

Managers upload from **My account** using the existing verified contact identity.
An upload adds an `image` field to the private proposal workflow from #1193,
retaining the other currently proposed fields. A new upload replaces that
proposal and its private file. Submitting a replacement text-only proposal
also discards the previous logo proposal. Admin review shows the current public
logo and the authenticated proposed logo side by side.

Administrators can upload directly in the existing organization editor after the
organization has been created. The upload publishes immediately; its help text
makes this explicit. Direct REST/MCP image-path edits likewise supersede a
manager's proposed logo. Other pending fields remain available for review.
Existing image paths and external URLs continue to work and are never deleted
from external storage. Managed upload paths cannot be assigned to another
organization by pasting them into the path field; use an upload instead.

## Validation and storage

The multipart `file` must declare PNG, JPEG or WebP and actually decode as that
format. SVG, corrupt images, MIME mismatches and animations are rejected. The
limits are 5 MiB of input and 16,000,000 input pixels. EXIF orientation is applied
before resizing to fit 2,048 × 2,048 pixels. A fresh PNG is encoded without
source metadata. Filenames contain an independent UUID and SHA-256 of the
encoded image; user-provided filenames never enter filesystem paths. Identical
uploads have separate ownership so deleting one cannot break another.

Configure `ORGANIZATION_LOGO_PUBLIC_ROOT` and `ORGANIZATION_LOGO_PENDING_ROOT`. Defaults
relative to the backend working directory are `./uploads/public/organizations`
and `./uploads/pending/organizations`. Neither root may contain the other.
The accepted URL is `/uploads/organizations/<uuid>-<sha256>.png`.
The backend serves this route locally (Vite proxies `/uploads`); production
Caddy should serve only the public root, with PNG content type and
`X-Content-Type-Options: nosniff`. Keep the pending root outside any public web
root. Persistent volumes, Caddy configuration and backups remain the separate
`tjorim/apps#262` deployment prerequisite.

Files are prepared before committing the new database reference. Obsolete
files are removed only after commit; rollback/session close removes newly
created files and preserves old files. Rejection, replacement, supersession
and organization deletion all retire private files. Acceptance copies into the
public root, commits the live reference, then deletes the private and previous
managed public files. There is no rollback retention window for old logos.

After a process crash or a logged filesystem deletion failure, run from
`backend/` with the same database/storage configuration:

```sh
uv run python -m app.services.organization_logos
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

- `POST /api/me/organizations/{id}/logo`: current verified contact only; returns
  `OrganizationChangeOut`. Creates a private proposal, never changes live `image`.
- `POST /api/organizations/{id}/logo`: administrator only; returns `OrganizationOut`.
  Publishes immediately and supersedes the pending `image` field.
- `GET /api/me/organizations/{id}/changes/{change_id}/logo`: current contact only.
- `GET /api/organizations/changes/{change_id}/logo`: administrator only.
- `POST /api/organizations/changes/{change_id}/decision`: existing administrator
  accept/reject API, now also handles logo promotion and cleanup (including MCP).
- `GET /uploads/organizations/{name}`: public PNGs only; pending filenames return 404.

Private preview responses use `Cache-Control: no-store`, `image/png` and
`nosniff`. Bearer-authenticated UI previews fetch a blob and revoke its object
URL on unmount. Errors are 415 for unsupported MIME type, 413 for input size or
pixel limits, 400 for invalid images, and 404 for unavailable/unauthorised
manager resources. Member/volunteer status alone gives no upload or review
rights; a verified current contact may act as a manager regardless of staff role.
Ownership is rechecked under the storage lock after decoding, so revocation
during validation prevents proposal/file creation.
