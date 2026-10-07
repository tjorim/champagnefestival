# Organisation terminology (#1190)

Decided 2026-10-07 by the owner. Use **organisation** as the generic UI term
for the record representing a producer, sponsor or vendor:

- English: organisation / organisations.
- Dutch: organisatie / organisaties.
- French: organisation / organisations.

The term covers commercial companies and associations without implying a
partnership or an organising role. Keep producer, sponsor and vendor labels
where the specific type matters. The account page uses “My organisations”,
“Mijn organisaties” and “Mes organisations”. A privately sponsoring individual
can still have a listing; this wording introduces no legal-form restriction.

“Exhibitor” suggested a stand; “partner” implied closer involvement; “business”
was not a natural label for associations. Organisation is the agreed umbrella.

## Full domain rename

The owner explicitly rejected retaining the previous technical names for
compatibility. Use American English **organization** throughout models, types,
modules, translation keys, API and MCP contracts, database identifiers,
configuration, cache keys, worker jobs and upload paths. User-facing English
continues to use British **organisation**. There are no legacy routes, field
aliases, settings or module shims.

Migration `005` renames the tables and edition/area/proposal references in place,
including constraints, indexes and the serial sequence. It updates managed logo
URLs, queued job types/resource types/deduplication keys and structured audit
keys/action names while preserving IDs, data, pending proposals, attempt counts
and user-authored text. Downgrade reverses these transformations. Earlier
migrations remain immutable historical steps; they do not expose runtime aliases.
The frontend cache buster changes because persisted row keys have changed.

## Deployment sequence

This is a coordinated breaking change for API clients, MCP integrations and
production infrastructure. Before starting the renamed API or worker:

1. Stop the old API and outbox worker and back up the database and both logo roots.
2. Update clients to `/api/organizations`, `/api/me/organizations`,
   `/uploads/organizations`, `organization_id`, `organizations`,
   `co_organizer_organization_id` and the renamed organization MCP tools.
3. Update the environment to `ORGANIZATION_REVIEW_RECIPIENT`,
   `ORGANIZATION_LOGO_PUBLIC_ROOT` and `ORGANIZATION_LOGO_PENDING_ROOT`.
   Remove the previous settings. Keep the existing stored files when changing
   directory or volume mount names; do not provision empty replacement volumes.
   For default local directories, move `uploads/public/exhibitors` to
   `uploads/public/organizations` and `uploads/pending/exhibitors` to
   `uploads/pending/organizations` while the application is stopped. Keep public
   and private storage separate. For mounted production roots, move/remount the
   existing volume contents and change Caddy to `/uploads/organizations/`.
4. Run `uv run alembic upgrade head` (through `005`), then deploy the matching
   frontend, API and worker together. The private proposal filenames themselves
   do not change. Verify public logos, private previews and pending notifications.

For rollback, stop the processes, downgrade to `004`, reverse the directory,
environment and Caddy changes, then deploy the preceding application version.
Production rollout remains in the separate infrastructure repository, including
apps#262/apps#263; this repository change does not alter the running deployment.

## Retry safety

The existing write strategies remain unchanged under the renamed endpoints and
tools; see [retry safety](../retry-safety.md). Migration preserves submission IDs
and notification job IDs/deduplication identity, so it does not recreate proposals
or enqueue a second job. Notifications remain at-least-once; the renamed email
Message-ID does not provide a cross-version exactly-once guarantee. Never retry a
non-idempotent write across the deployment without checking its recorded outcome.

## Verification (2026-10-07)

- Fresh PostgreSQL upgrade through `005` passes. The populated migration test
  upgrades `004` to `005`, downgrades and re-upgrades, checking table/column/FK,
  constraint/index/sequence names, contact/edition/area references, proposal
  content/status, job identities/attempts, structured audit keys and managed
  logo URLs. It confirms user-authored text is unchanged and serial IDs advance.
- The contract test verifies the OpenAPI schemas contain only the new domain
  names, old routes return 404 and obsolete edition payload fields return 422.
- 105 focused backend tests pass. The full 1,455-test run passed 1,452; an
  unspecified audit row-order assertion and migration-test logging side effects
  caused the three failures. The audit query now orders explicitly, and the
  migration test avoids global logging reconfiguration. All 18 tests across
  proposal review, migration and request-correlation suites then pass in order.
- All 993 frontend tests pass (including 162 focused integration/cache tests).
  Typecheck, lint, formatting and production build pass for the frontend; Ruff
  lint/format and ty checks pass for the backend.
- The clean Chromium run passed 275 of 276 tests; the admin-table initial-render
  visibility check timed out. Rerunning that file passed both tests plus auth
  setup (3 passing). An earlier browser run was interrupted after translation
  generation disrupted the active Vite server; the clean run used a fresh server.
- Runtime backend/frontend source and translation keys contain no exhibitor
  identifiers. Remaining occurrences are migration history, rename regression
  tests and the terminology/deployment history. No production deployment was run.
