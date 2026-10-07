# Organisation change review (#1193)

Managers sign in through the existing `/me` identity (#1192). Every request
checks their currently verified email against the organization's current contact;
other organizations and nonexistent IDs both return 404. No manager write can
change names, contact identity, activity, type, editions or allocations. [Logo uploads](organization-logo-upload.md) add a private image proposal through a separate validated multipart endpoint.

The private `organization_changes` table retains proposal history, separate from
live organizations. A partial unique index allows one pending proposal per
organization. A fresh submission replaces that proposal; old IDs remain terminal
and cannot later be accepted. Public APIs and server-rendered pages read only
live organization fields. Deleting an organization cascades its private history;
audit entries remain.

## REST and MCP API

| Endpoint/tool | Access | Contract |
| --- | --- | --- |
| `GET /api/me/organizations` | Verified signed-in identity | Managed organizations, including live description texts. |
| `GET /api/me/organizations/{id}/changes` | Current manager | History newest first, with status, reason, superseded fields, proposed and current texts; `Cache-Control: no-store`. |
| `POST /api/me/organizations/{id}/changes` | Current manager | Required UUID `submission_id`; optional `website`, `description_language`, `description_nl`, `description_fr`, `description_en`. At least one field required. Unknown fields rejected. |
| `GET /api/organizations/changes`; MCP `list_organization_changes` | Admin | Pending proposals with current values for review. |
| `POST /api/organizations/changes/{id}/decision`; MCP `decide_organization_change` | Admin | `decision`: `accepted` or `rejected`; optional `reason` (2,000 characters). Repeats of the same decision converge; opposite decisions/replaced/superseded IDs return 409 (MCP error). |

Descriptions follow #1191: plain text, 600 characters per language, original
language Dutch/French/English and nonempty original text whenever a translation
exists. Omitted fields retain their live value. Null clears description fields;
an empty string clears the website. Website validation matches the admin form
(`http://` or `https://`, maximum 500 characters). UI output is escaped text.

## Review and precedence

The manager's organization tab on `/me` shows history and an allowed-field form.
The admin Organisations tab shows current and proposed texts side by side for
every description language, with accept/reject and an optional rejection reason.
The reason is sent only with rejection; acceptance sends no rejection text.
Accept changes only fields still pending. Rejection preserves all live data.

Submit, decisions and direct admin edits serialize on the same organization row
lock, refreshing the row after acquiring the lock. An admin's direct REST/MCP
edit removes matching fields from the pending proposal. If changing/clearing the
original language makes remaining proposed translations invalid, those dependent
description fields are superseded too. Remaining unrelated fields stay pending;
an empty proposal becomes `superseded`. History records the removed field names,
and audit entries identify each submitting or reviewing actor. An accept or
reject is audited once; retrying does not duplicate the mutation or audit.

## Notification and deployment

Apply migrations through `004` before deploying the renamed API and worker. Set
`ORGANIZATION_REVIEW_RECIPIENT` to one shared mailbox in the environment's infra env
file, and configure the existing SMTP settings. An unset/empty value skips
queueing, without fallback or error. Submission snapshots the recipient and
queues one durable `organization_change_notification` job in the same transaction.
The normal outbox worker sends the admin review link; retrying submission with
the same ID never queues another job. SMTP transport remains at-least-once:
an ambiguous delivery can result in duplicate mail, as with existing outbox
notifications; a stable Message-ID helps mailbox deduplication.

Logo upload (#1194) extends this workflow; see the [storage and API contract](organization-logo-upload.md). Per-admin emails and automatic translation remain separate.
See [retry safety](retry-safety.md) for caller retry rules.

## Terminology and upgrade

Use **organisation** in English and French UI, **organisatie** in Dutch, and
**organization** in code. The generic term covers companies and associations;
keep producer, sponsor and vendor labels where the specific type matters.
API/MCP contracts, database identifiers, settings and upload paths use the new
name without legacy aliases.

Revised Alembic `004` renames existing records and references, managed logo URLs
and structured audit identifiers, then adds descriptions and proposal history.
Existing IDs, relationships and user-authored text survive; `000`–`003` are unchanged.

For rollout, stop the old API/worker and back up the database and both logo roots.
Update clients and MCP integrations to the organization routes and fields. Set
`ORGANIZATION_REVIEW_RECIPIENT`, `ORGANIZATION_LOGO_PUBLIC_ROOT` and
`ORGANIZATION_LOGO_PENDING_ROOT`, removing the old settings. Move or remount
existing logo contents under the new roots (local defaults:
`uploads/{public,pending}/exhibitors` → `uploads/{public,pending}/organizations`);
keep pending files private and update Caddy to `/uploads/organizations/`.
Run `uv run alembic upgrade head`, then deploy matching frontend, API and worker.
Verify public logos, private previews and queued notifications. Production storage
and translation activation remain gated on `tjorim/apps#262` and `tjorim/apps#263`.

A database stamped with the previous `004` or withdrawn `005` will not rerun the
revised migration: downgrade using the previous migration files first, or rebuild
a disposable development database. Never stamp a mismatched schema as current.
Rollback to `003` drops descriptions and proposal history; restore the backup
if these must survive, and reverse the storage/configuration changes with the
matching application version.
