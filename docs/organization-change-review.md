# Organisation change review (#1193)

UI terminology: [organisation / organisatie / organisation](decisions/1190-organisation-terminology.md). The full technical rename and migration are recorded there.

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

The manager's organization tab on `/me` shows history and an allowed-field form.
The admin Organisations tab shows current and proposed texts side by side for
every description language, with accept/reject and an optional rejection reason.
Each bounded field comparison uses the controlled `AdminDataTable` renderer
and `useAppTable`, including the logo row. The complete pending proposal set
remains a TanStack Query result; it does not need a paged organization API.
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

Apply migrations through `005` before deploying the renamed API and worker. Set
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


## Acceptance verification (2026-10-07)

- [x] Public edition responses include the live organization but exclude proposed values; acceptance publishes them.
- [x] Admin review compares current and proposed values for every description language.
- [x] Any admin can review; members and volunteers cannot.
- [x] Direct admin REST/MCP edits supersede matching/dependent pending fields, visible in manager history.
- [x] Manager reads and writes for other/nonexistent organizations return the same 404.
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

## Shared review renderer verification (#1190, 2026-10-07)

The final epic integration replaces the inline comparison markup with the
controlled `AdminDataTable` renderer. Current/proposed text in every language,
authenticated logo previews, rejection reasons and stale-decision handling
retain their existing component coverage. All 993 frontend tests pass (including
49 focused tests across eight organization/account suites), along with typecheck,
lint, formatting and production build. Lint retains existing unrelated warnings.
Backend behavior is unchanged and its tests were not rerun for this renderer
change. The integration remains uncommitted pending review/merge.
