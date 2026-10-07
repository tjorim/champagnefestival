# Exhibitor change review (#1193)

Managers sign in through the existing `/me` identity (#1192). Every request
checks their currently verified email against the exhibitor's current contact;
other exhibitors and nonexistent IDs both return 404. No manager write can
change names, contact identity, activity, type, editions or allocations. [Logo uploads](exhibitor-logo-upload.md) add a private image proposal through a separate validated multipart endpoint.

The private `exhibitor_changes` table retains proposal history, separate from
live exhibitors. A partial unique index allows one pending proposal per
exhibitor. A fresh submission replaces that proposal; old IDs remain terminal
and cannot later be accepted. Public APIs and server-rendered pages read only
live exhibitor fields. Deleting an exhibitor cascades its private history;
audit entries remain.

## REST and MCP API

| Endpoint/tool | Access | Contract |
| --- | --- | --- |
| `GET /api/me/exhibitors` | Verified signed-in identity | Managed exhibitors, including live description texts. |
| `GET /api/me/exhibitors/{id}/changes` | Current manager | History newest first, with status, reason, superseded fields, proposed and current texts; `Cache-Control: no-store`. |
| `POST /api/me/exhibitors/{id}/changes` | Current manager | Required UUID `submission_id`; optional `website`, `description_language`, `description_nl`, `description_fr`, `description_en`. At least one field required. Unknown fields rejected. |
| `GET /api/exhibitors/changes`; MCP `list_exhibitor_changes` | Admin | Pending proposals with current values for review. |
| `POST /api/exhibitors/changes/{id}/decision`; MCP `decide_exhibitor_change` | Admin | `decision`: `accepted` or `rejected`; optional `reason` (2,000 characters). Repeats of the same decision converge; opposite decisions/replaced/superseded IDs return 409 (MCP error). |

Example submission:

```json
{
  "submission_id": "12ce342e-1469-46df-bde6-6d53d7cb8089",
  "website": "https://example.com",
  "description_language": "fr",
  "description_fr": "Notre maison de champagne.",
  "description_en": "Our champagne house."
}
```

Descriptions follow #1191: plain text, 600 characters per language, original
language Dutch/French/English and nonempty original text whenever a translation
exists. Omitted fields retain their live value. Null clears description fields;
an empty string clears the website. Website validation matches the admin form
(`http://` or `https://`, maximum 500 characters). UI output is escaped text.

## Review and precedence

The manager's exhibitor tab on `/me` shows history and an allowed-field form.
The admin Exhibitors tab shows current and proposed texts side by side for
every description language, with accept/reject and an optional rejection reason.
The reason is sent only with rejection; acceptance sends no rejection text.
Accept changes only fields still pending. Rejection preserves all live data.

Submit, decisions and direct admin edits serialize on the same exhibitor row
lock, refreshing the row after acquiring the lock. An admin's direct REST/MCP
edit removes matching fields from the pending proposal. If changing/clearing the
original language makes remaining proposed translations invalid, those dependent
description fields are superseded too. Remaining unrelated fields stay pending;
an empty proposal becomes `superseded`. History records the removed field names,
and audit entries identify each submitting or reviewing actor. An accept or
reject is audited once; retrying does not duplicate the mutation or audit.

## Notification and deployment

Apply migration `004` before deploying the API and worker. Set
`EXHIBITOR_REVIEW_RECIPIENT` to one shared mailbox in the environment's infra env
file, and configure the existing SMTP settings. An unset/empty value skips
queueing, without fallback or error. Submission snapshots the recipient and
queues one durable `exhibitor_change_notification` job in the same transaction.
The normal outbox worker sends the admin review link; retrying submission with
the same ID never queues another job. SMTP transport remains at-least-once:
an ambiguous delivery can result in duplicate mail, as with existing outbox
notifications; a stable Message-ID helps mailbox deduplication.

Logo upload (#1194) extends this workflow; see the [storage and API contract](exhibitor-logo-upload.md). Per-admin emails and automatic translation remain separate.
See [retry safety](retry-safety.md) for caller retry rules.


## Acceptance verification (2026-10-07)

- [x] Public edition responses include the live exhibitor but exclude proposed values; acceptance publishes them.
- [x] Admin review compares current and proposed values for every description language.
- [x] Any admin can review; members and volunteers cannot.
- [x] Direct admin REST/MCP edits supersede matching/dependent pending fields, visible in manager history.
- [x] Manager reads and writes for other/nonexistent exhibitors return the same 404.
- [x] Rejection preserves live data and records its reason; acceptance applies only pending fields.
- [x] Submission queues one mailbox notification job; an unset recipient skips it.
- [x] Submit, review and supersession have actor audit entries; replay and concurrent decisions do not double-apply.
- [x] Retry safety, README, API documentation, migration and backend/frontend checks are verified.

Backend coverage includes all 1,406 collected tests. The initial full run passed
1,385 before local PostgreSQL stopped; 76 recovery tests covered the remaining
files and workflow, and all nine workflow tests passed again after strengthening
public visibility and reviewer-identity assertions. Frontend tests: 975 passing.
Browser checks: 163 public and 113 authenticated/setup passing. Backend lint,
format and type checks, a fresh upgrade through combined migration `004`, downgrade
to `003` and re-upgrade, and frontend lint, format,
type checks and production build passed. The real browser workflow also verified
acceptance and the manager's accepted state. No production deployment was performed.
