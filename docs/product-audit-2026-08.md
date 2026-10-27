# Product audit and remaining work

Completed UI migration notes (#1105, #1107, #1108, #1110 and #1111) were consolidated
into the [frontend UI guide](frontend-ui.md) on 2026-10-07. Completion records
and original findings remain below; detailed migration history remains in Git.


Updated 2026-10-27. This is the current scope, dependency and preferred-order
record for the August 2026 audit and communications roadmap. GitHub issues
hold discussion and workflow state; decision documents hold current contracts.

## Maintenance

Update this file in the same change that implements, closes, splits or
materially changes tracked work. Remove completed items from the active queue,
renumber the preferred order, and add a dated outcome with issue/PR or commit
evidence to **Completed or superseded work**. Partial work stays active until
its acceptance criteria are met. Preserve the original finding/specification
in the Git history identified below rather than duplicate its narrative.

## Preferred order

The remaining implementation-ready follow-up retains its previous order. #802 has
owner-agreed design guidance with one open organiser question. Its separate
listing does not assign a new priority.

| Order | Issue | Current status and remaining acceptance gates |
| --- | --- | --- |
| 1 | [#953 — visitor passwordless accounts](https://github.com/tjorim/champagnefestival/issues/953) | Sessions and order history are implemented in #1012, with unified `/me` access and [confirm-first OIDC claiming](decisions/1044-confirm-first-registration-claiming.md). Verify production transactional email before enabling localised **My orders** navigation; publish the privacy/account copy. See [session contract](decisions/953-visitor-passwordless-session.md). |

### Active implementation and work needing scope decisions

- [#1209 — one account with password and magic-link login](https://github.com/tjorim/champagnefestival/issues/1209): Owner confirmed both methods on 2026-10-07. App side implemented: a Keycloak login with a verified email joins or merges into the matching email account (migration `005`), linked addresses are steered to the account sign-in instead of an app link, audit provenance follows the method and sign-out revokes both sessions. **Still open:** configure/verify Keycloak SMTP and activate the prepared flow in `tjorim/apps`, verify both complete browser logins in production, and decide whether to also end emailed sessions when a Keycloak account is disabled. See the [login decision](decisions/1192-organization-manager-login.md#both-sign-in-methods-for-one-account--1209).

- [#1197 — read-only admin warm start](https://github.com/tjorim/champagnefestival/issues/1197): Query/IndexedDB persistence, whole-key scope, active-edition registrations, app-level session wipes, async fences and visible saved-row state are implemented with regression coverage. #1182 is complete. Remains active until the owner checks the current published policy and representative edition/device/private-mode sizing is checked; synthetic browser measurements and the internal volunteer rule are in the [implementation record](decisions/1168-persisted-collections.md#implementation-verification-1197-2026-10-07). No public policy text or externally callable write changed.


- [#802 — bourse seating model](https://github.com/tjorim/champagnefestival/issues/802): [owner-agreed booking/product guidance](decisions/802-booking-products-and-seating.md) covers event-owned plans, manual/partial allocation with guest counts per table for split festival bookings, optional stock, booked prices, nested included products and shared notes. The three implementation increments now provide inventory/packages, multi-room event plans, split/shared/exclusive allocations, and a combined booking/payment/quantity editor. The editor previews totals and payment differences and requires the administrator to choose which table to release before an over-allocated quantity reduction can be saved atomically. The plan itself supports adding, moving, changing guest counts and removing booking allocations from a selected table. Visitors can submit a change or cancellation request that leaves the booking active for an administrator decision; approval and reimbursement are not guaranteed — that request's organiser notification is now delivered through the durable outbox (retried on transient failure) rather than a best-effort inline send. Products carry an optional short description; a package inclusion's visibility in the visitor-facing order summary is decided entirely by whether its target product is purchasable (#1020, below) — it still counts toward stock/preparation totals either way. Booking payments are an append-only ledger (#1019): an administrator records dated transactions (a positive amount for a payment, negative for a refund, with an optional reference/note — there's no separate `kind` field) against a booking rather than editing one mutable paid total, and `amount_paid`/`payment_status` are derived from the ledger's sum rather than settable directly. The booking editor shows the chronological ledger and an "Add transaction" flow (a refund can still be linked to the specific entry it reverses via `reversed_transaction_id`, but the form relies on the entry's note/date for that rather than a picker). Admins can see total paid/due plus received/refunded/outstanding/refund-liability per edition (edition attendance stats) and the same received/refunded breakdown per person (people registrations view), then drill into the underlying ledger entries for that edition or person in an in-app modal or export the same filtered set as CSV, and compare two floor plans for a room to see added/removed/changed tables and areas. #1021 added immutable, named revisions of one event-room plan on top of that comparison: an explicit **Save revision** action snapshots the current tables/areas/room geometry (never allocations) under a concurrency-safe revision number; any two revisions, or a revision against the live draft, can be compared or restored, matched by each table/area's stable id rather than its mutable name so a rename never reads as an add+remove; and restoring previews the affected geometry and refuses (unless explicitly overridden) to delete or move a table/area that still holds a live registration or organization assignment — restoring itself never touches registrations or allocations. Issue #1020 replaced the standalone `active` flag with a single `purchasable` boolean covering both standalone order availability and visitor visibility — existing active/inactive products migrated to purchasable true/false; only a purchasable product is orderable standalone, counts toward the required-product rule, and is ever named to a visitor, standalone or as a package line; a required product must be purchasable (enforced at the schema, service, and database-check-constraint layers); a hidden (`purchasable=False`) product can always be newly bundled into a package (there is no longer a separate "disabled" state that blocks this); and the unauthenticated edition/checkout responses now serialise a slim visitor-safe product shape (no `stock`) that excludes hidden products entirely, including stripping any inclusion edge pointing at one, while admin endpoints and a matching MCP `*_product` tool set keep the full shape. Capsule-exchange companion policy remains the only undecided scope; #802 stays open until that rule is confirmed or split out.

### Active acceptance gates

For #953:

- [x] Repository-side visitor sessions and owned order history implemented.
- [ ] Production email delivery verified end to end.
- [ ] Localised public navigation enabled after verification.
- [ ] Privacy/account copy published for the implemented session.

For #1260 (venue rehearsal; see [signage setup](signage-setup.md#rehearsal-required-before-event-use)):

- [x] Repository implementation of all sub-issues (#1261–#1265) and the separate MP4 follow-up (#1349).
- [ ] Two-laptop rehearsal with one deliberately wrong clock: slides match within about one second, a mid-cycle publish switches at the cycle boundary.
- [ ] Offline reload, wake lock beyond the OS sleep timeout and reconnect verified on venue hardware.

## Dependencies and accepted boundaries

- #1408 is implemented: [email categories and per-category consent](decisions/1408-email-categories-and-consent.md) now define who may be mailed (consent, role at send time, verified address). #1407 builds its audience from them.

- #1407 is partial: the [disabled provider-neutral member-mail boundary](decisions/1407-member-mail-foundation.md) validates individual envelopes and builds one-click headers, but sends nothing. The composer `email` channel (frozen audience, per-recipient single-attempt jobs), signed one-click unsubscribe and the suppression list are implemented behind it and refused until a provider is configured. The unsubscribe page, reward-ready trigger, recipient-count confirmation and composer UI are implemented too. Only the provider decision and its adapter/feedback webhook, a real test send, and final wording/retention sign-off remain; no completion is recorded.

- #1195 adds optional self-hosted description drafts to the admin and manager editors. Backend callers now support mounted app-scoped engine keys and bounded transport without automatic retries; authentication activation must follow both caller releases. Repository behavior is implemented; production activation, the French decision and shared-worker contention remain gated on `tjorim/apps#263`. See [configuration and API contract](organization-description-translation.md).

- #1190 and its five repository sub-issues are implemented; see the [review API and upgrade guidance](organization-change-review.md). Production rollout remains gated on `tjorim/apps#262` and `tjorim/apps#263`; account unification remains #1209.

- #1192 provides the verified contact identity for #1193 text review and #1194 logo proposals; #1191 supplies public descriptions.

- #1406 builds on #1405: admin card-type management and default selection, member card/reward history, server-owned reward-due filtering and confirmed hand-out/reversal are implemented. Card snapshots and reversal guards remain owned by the backend; new cards use the active selected type.

- #1404 builds on #1403: per-event members-only setting, verified visitor-session gate for bookings/waitlist, translated sign-in guidance, and preservation of existing registrations. Existing registrations are retained; admin-created registrations remain exempt.

- #953's code prerequisites (#922, #924, #947) are complete; delivery verification is an operational gate.
- #932 is closed under the accepted one-API-worker deployment scope. Remaining process-local limits and metrics are not a planned scaling project. Revisit only if measured load warrants it; see [deployment](../DEPLOYMENT.md).
- #946 is closed: all communications children (#940, #943, #944, #945, #947, #941, #942) are implemented.
- Public communications use fixed forms and rendering, escaped/sanitised content, audited admin changes and explicit locales. Arbitrary pages/HTML/CSS, uploaded audiences, database-managed credentials and bulk marketing email are excluded.
- Web check-in requires live connectivity; no offline write queue is planned. The shared service worker uses additive feature modules; see [Web Push](decisions/941-web-push-foundation.md).
- Retention and push implementations did not automatically republish formal privacy-policy content. That remains owner-managed through the policy editor; see [retention](decisions/934-data-retention-and-erasure.md) and [push](decisions/941-web-push-foundation.md).
- Write guarantees remain in [retry safety](retry-safety.md); delivery operations remain in [outbox operations](outbox-worker.md).

## Completed or superseded work

The ledger records implementation completion, not proof of a production release.
Detailed original specifications and checked acceptance criteria remain in the
Git history; current decisions live in the linked decisions.

| Issue | Outcome | Completed | Evidence | Implementation note |
| --- | --- | --- | --- | --- |
| [#1408](https://github.com/tjorim/champagnefestival/issues/1408) | Repository implementation complete | 2026-10-24 | Migration `010`; consent, category, registration-form and merge/anonymisation backend tests; self-service, confirmation page and admin component tests | Admin-managed email categories (nl required, fr/en optional) with the roles that may use them; consent records per person and category (granted, source, withdrawn) written only by the person themselves, in the account preferences (`GET`/`PUT /api/me/email-preferences`) or through an emailed single-use link for the registration form's updates option; admins can view consent and record an opt-out, never grant it. `Person.marketing_opt_in` is gone. Consent history survives anonymisation and merging; an active consent keeps the address. Sending stays with #1407. See the [decision](decisions/1408-email-categories-and-consent.md). |
| [#1406](https://github.com/tjorim/champagnefestival/issues/1406) | Repository implementation complete | 2026-10-24 | Stamp-card component/check-in tests, authenticated Chromium flow and backend list/count/export regression | Card-type editor with nl/fr/en fields and deactivation; default type selection; member progress, completed cards and rewards; reward-due badges/filter; confirmed hand-out/reversal with translated errors. QR/manual check-in retains stamp progress and earned-reward feedback. Writes are explicit and never automatically retried. |
| [#1404](https://github.com/tjorim/champagnefestival/issues/1404) | Repository implementation complete | 2026-10-24 | Migration `010`; REST/MCP/OpenAPI, membership-gate regression tests and registration e2e | Per-event members-only switch and badge; registration and waitlist require an email-link visitor session matching a current member. Bookings attach to the member Person and session User; translated sign-in guidance and stable errors. Admin bookings bypass the gate; switching the flag keeps existing bookings. Retry decisions are in `docs/retry-safety.md`. |
| [#1403](https://github.com/tjorim/champagnefestival/issues/1403) | Repository implementation complete | 2026-10-24 | Migration `010`; member overview, REST/MCP and regression tests | Advisory places/inactivity settings, sortable capsule-exchange attendance, admin exemptions and current-member email uniqueness including role grants, reactivation and merge. #1404 can build on the unique-email invariant; no automated retirement. |
| [#1360](https://github.com/tjorim/champagnefestival/issues/1360) | Completed | 2026-10-20 | #1360; migration `009`; poll lifecycle, MCP, component/CSV and migration tests | Owner expanded the original third-kind request to all three candidates: single choice, free text (500 characters), and rating (1–5). Typed answer tables and additive wire fields preserve existing reads; volunteer entry/clearing, admin correction after closing, overview and CSV share the kind handlers/maps. Owner-authorised reuse adds optional, event-scoped visitor order questions in migration `009`, with per-order typed answers, shared controls/validation, immutable used definitions, checkout/admin entry and CSV/account display. [Wire and rollback decision](../backend/README.md#volunteer-poll-questions-migration-009). Updated 2026-10-24 (owner-requested follow-up, migration `010`): attendance questions can link volunteer-only events; yes/no answers atomically maintain one confirmed/cancelled registration and party size. Admin/MCP entry, immutable used links, copying without links, protected bookings, translated controls and retry decisions are covered by regression tests. |
| [#1260](https://github.com/tjorim/champagnefestival/issues/1260) | Repository implementation complete; venue rehearsal retains a separate gate | 2026-10-18 | #1261–#1265 (PRs #1270, #1271, #1272, #1301, #1350) and #1349 (PR #1352); [signage epic summary](#signage-epic-1260) | Public `/signage/{channel}` player synced to the server clock, wake lock, offline worker cache, layered template editor, channel/playlist admin and offline/PNG/MP4 exports. Urgent interrupts and video/audio slides remain out of scope. |
| [#1265](https://github.com/tjorim/champagnefestival/issues/1265) | Completed | 2026-10-18 | #1265; archive, capture-failure and offline Chromium export tests | Published-channel PNG snapshots and local-folder HTML/JSON bundles reuse the renderer and epoch clock; translated admin actions and setup/retry guidance. |
| [#1264](https://github.com/tjorim/champagnefestival/issues/1264) | Completed | 2026-10-17 | #1264; draft-projection, renderer/model and authenticated playlist/axe tests | Content → Screen channels: channel links, typed organisation blocks, translated notices, uploads, schedules, drag/keyboard ordering and shared-renderer draft playback. Updated 2026-10-19: channel and slide create/edit dialogs with guarded dismissal. |
| [#1263](https://github.com/tjorim/champagnefestival/issues/1263) | Completed | 2026-10-16 | #1263; shared renderer, layer-model and authenticated editor tests | Layered template editor with uploads, real-data previews, accessible geometry controls, history, translated UI and service-enforced required bindings; see [layer contract](signage-layer-contract.md). Updated 2026-10-19 (PR #1356): Content → Screen channels → Screen templates, guarded create/edit dialogs, frontmost-first layer panel with drag/keyboard ordering and row visibility/locking, direct/add-missing placeholders and contextual properties. |
| [#1190](https://github.com/tjorim/champagnefestival/issues/1190) | Repository implementation complete; production rollout retains separate gates | 2026-10-07 | PRs #1207, #1208, #1211, #1212, #1213; shared-renderer integration | All five sub-issues are closed; review uses the shared table renderer. The full organization rename has no aliases and is folded into migration `004`; see [upgrade guidance](organization-change-review.md#terminology-and-upgrade). Production remains gated on apps#262/apps#263; account unification remains #1209. |
| [#1195](https://github.com/tjorim/champagnefestival/issues/1195) | Repository implementation complete; production activation gated on tjorim/apps#263 | 2026-10-07 | PR #1213; [API contract](organization-description-translation.md) | Editable, stateless translation drafts with configured languages, rate/concurrency limits and stale-result protection. Normal save/submit controls publication; production activation remains apps#263. |
| [#1194](https://github.com/tjorim/champagnefestival/issues/1194) | Repository implementation complete; production serving gated on tjorim/apps#262 | 2026-10-07 | PR #1212; [storage, API and recovery](organization-logo-upload.md) | Validated PNG uploads, private proposals/previews and immediate admin publication. Transactional cleanup and lock-protected reconciliation cover replacement, deletion and crash recovery; production storage/serving remains apps#262. |
| [#1193](https://github.com/tjorim/champagnefestival/issues/1193) | Completed | 2026-10-07 | PR #1211; [API contract](organization-change-review.md) | Private proposal history, admin REST/MCP review, live-edit supersession, actor audits and shared-mailbox notifications. Submission IDs and decisions converge on replay. |
| [#1192](https://github.com/tjorim/champagnefestival/issues/1192) | Completed | 2026-10-07 | PR #1208; [decision](decisions/1192-organization-manager-login.md) | Shared email/OIDC identity with live verified contact checks supplies managed organizations on `/me`. Staff roles remain Keycloak-authoritative; universal password/magic-link unification remains #1209. |
| [#1191](https://github.com/tjorim/champagnefestival/issues/1191) | Completed | 2026-10-07 | PR #1207 | Optional plain-text descriptions in Dutch, French and English (600 characters each), admin REST/MCP editing, public language fallback and conditional vendor display. |
| [#1174](https://github.com/tjorim/champagnefestival/issues/1174) | Completed | 2026-10-07 | Closed sub-issues #1175–#1182; implementation records below | Members, Volunteers, People and registrations share `AdminDataTable` and server paging, sorting, filters and full-result counts. Query pages retain previous data; people mutations are optimistic; only the active edition's complete registration set remains eagerly loaded. [Decision and completion record](decisions/tanstack-db.md#roadmap). Persistence implementation remains separate in #1197. |
| [#1179](https://github.com/tjorim/champagnefestival/issues/1179) | Completed with #1181 | 2026-10-06 | Working-tree implementation; mutation regression tests | Query optimistic edits/deletes with authoritative rollback, overlapping-write coordination, pending rows and session fencing; creates and merges remain non-optimistic. [Implementation and retry policy](people-query-layer.md). |
| [#1181](https://github.com/tjorim/champagnefestival/issues/1181) | Completed with #1179 | 2026-10-06; updated 2026-10-19 | Working-tree implementation; screen and authenticated E2E tests; PR #1356 follow-up | Members, Volunteers and People use server pages, filters, sorting, full-set counts/exports and bounded duplicate lookup; preserved forms, actions and saved columns; retired eager people collection and consumers. Dedicated volunteer creation/editing now matches the People role flow: only a name is required, identity/help periods are optional and can be added or cleared later through UI, REST and MCP; see [contract](people-query-layer.md#optional-admin-volunteer-details-2026-10-19). |
| [#1178](https://github.com/tjorim/champagnefestival/issues/1178) | Completed; consumers migrated in #1181 | 2026-10-06 | #1178; working-tree implementation | Reusable server pages and full-set counts with cancellation, previous-page placeholders, sign-out fencing and live/reconnect invalidation; [handoff](people-query-layer.md). The former people collection was retired with #1179/#1181. |
| [#1182](https://github.com/tjorim/champagnefestival/issues/1182) | Completed | 2026-10-07 | Working-tree implementation; collection, page, live-event and occupancy tests | Active-edition registration collection; shared manual table renderer and Query page hook; bounded server count facets; historical details and selected-event occupancy loaded on demand; server check-in titles preserve historical labels. Frontend (935), backend (1373) and e2e (275, including three timeout reruns) checks passed; [decision](decisions/tanstack-db.md#registration-scope-and-shared-table-1182-2026-10-07). |
| [#1180](https://github.com/tjorim/champagnefestival/issues/1180) | Completed | 2026-10-06 | Working-tree implementation; component tests | Shared manual-mode table with namespaced URL state, debounced search, filters, saved columns, responsive cards, confirmed actions and full-matching adapters; [integration contract](admin-data-table.md). People screen adoption completed in #1181; registrations adopted the controlled renderer in #1182. Updated 2026-10-19 (PR #1356): generated shadcn Pagination shared by tables/ledger, Empty states shared by admin consumers, and Toggle Group filters; query and mutation contracts remain unchanged. |
| [#1177](https://github.com/tjorim/champagnefestival/issues/1177) | Completed | 2026-10-06 | #1177; working-tree implementation | Backend full-set people counts, sortable registration counts, bounded exact email lookup and cursor-streamed filtered people/volunteer CSVs; [contract and scale evidence](people-aggregates.md). Builds on #1176; frontend migration completed in #1181. |
| [#1111](https://github.com/tjorim/champagnefestival/issues/1111) | Completed | 2026-10-02 | #1111; [frontend guide](frontend-ui.md) | Removed `bootstrap`, `react-bootstrap` and `bootstrap-icons`, `data-bs-theme` and every `--bs-*` variable; Tailwind preflight (plus a documented `base`-layer set of document defaults) replaces reboot; the `tw:` prefix, utility `important`, `data-tailwind-migrated` markers, coexistence tests and the generated legacy lint allow-list and exception baseline are gone, with the four shadcn rules configured directly (owned class namespaces are the only allowance). Leaflet, Swiper, the owned stylesheets and every runtime theme now live in cascade layers beneath the utilities; dormant theme declarations that the layering would have activated were resolved to preserve the rendered pages. |
| [#1103](https://github.com/tjorim/champagnefestival/issues/1103) | Completed | 2026-10-02 | #1111 and the #1104–#1123 sub-issues | Tailwind and Base UI are the shared frontend stack and Bootstrap is gone; see [frontend UI guide](frontend-ui.md). Updated 2026-10-19 (PR #1356): generated base-vega Sidebar/Sheet, Toggle Group, Skeleton, Empty and Pagination replace remaining custom admin compositions; shared controls also cover public floor-plan selection and preview theme toggles. |
| [#1123](https://github.com/tjorim/champagnefestival/issues/1123) | Completed | 2026-10-02 | PR #1133; [current styling](frontend-ui.md#cascade-layers) | Custom views and remaining CSS exceptions: owned CSS for `MaintenancePage`, announcement seams and `ThemeSwitcher`; frozen exceptions 15 → 0. |
| [#1122](https://github.com/tjorim/champagnefestival/issues/1122) | Completed | 2026-10-02 | PR #1132; [current styling](frontend-ui.md#cascade-layers) | Owned `Alert`, `Badge` and `Spinner` primitives replace all Bootstrap importers. |
| [#1121](https://github.com/tjorim/champagnefestival/issues/1121) | Completed | 2026-10-01 | PR #1130; [current styling](frontend-ui.md#cascade-layers) | Owned `Button`, `ButtonLink` and `ButtonGroup` replace all Bootstrap buttons. |
| [#1120](https://github.com/tjorim/champagnefestival/issues/1120) | Completed | 2026-10-01 | PR #1129; [current styling](frontend-ui.md#cascade-layers) | Owned public form controls replace the Bootstrap `Form` importers. |
| [#1119](https://github.com/tjorim/champagnefestival/issues/1119) | Completed | 2026-10-01 | PR #1128; [current styling](frontend-ui.md#cascade-layers) | Owned admin Field/Input/Textarea/Select/Checkbox/Switch controls; TanStack form state and write ownership unchanged. |
| [#1118](https://github.com/tjorim/champagnefestival/issues/1118) | Completed | 2026-10-01 | PR #1127; [current styling](frontend-ui.md#cascade-layers) | Owned Card slots and semantic lists replace Bootstrap Card/ListGroup. |
| [#1117](https://github.com/tjorim/champagnefestival/issues/1117) | Completed | 2026-09-30 | PR #1126; [current styling](frontend-ui.md#cascade-layers) | Container/Row/Col and ordinary layout utilities migrated, site breakpoints preserved. |
| [#1108](https://github.com/tjorim/champagnefestival/issues/1108) | Completed | 2026-09-30 | PR #1116; [frontend guide](frontend-ui.md) | Public navigation and disclosure widgets moved to Base UI primitives. |
| [#1110](https://github.com/tjorim/champagnefestival/issues/1110) | Completed | 2026-09-30 | #1110; [icon contract](frontend-ui.md#public-interactions-and-accessibility) | Replaced Bootstrap icon font renderers with decorative Lucide SVGs, preserved labels and saved floor-plan identifiers through a finite compatibility map, removed the stylesheet/lint vendor source and obsolete icon CSS. Theme, accessibility and build checks cover the migration; package removal completed in #1111. |
| [#1109](https://github.com/tjorim/champagnefestival/issues/1109) | Planning completed; migration finished in #1111 | 2026-09-30 | #1117–#1123; [current styling](frontend-ui.md#cascade-layers) | Created the #1117–#1123 migration work. Obsolete inventories and removal gates were consolidated into current styling guidance on 2026-10-07; original findings remain in Git. |
| [#1107](https://github.com/tjorim/champagnefestival/issues/1107) | Completed | 2026-09-29 | #1107; [frontend guide](frontend-ui.md) | Replaced all Bootstrap modals with generated Base UI Dialog/Alert Dialog primitives and all react-select pickers with searchable Base UI Comboboxes; preserved form/save ownership, dismissal, focus, pending/error handling and admin/public portal themes; removed unused modal/select CSS and the react-select dependency. Component accessibility/interaction coverage and browser registration/theme/coexistence checks verify the migration. Review follow-up on 2026-09-30 preserves event drafts across prop refreshes and dirty contact settings across maintenance-mode refreshes; explicit reopen/record switches and successful-save baselines remain supported. A further review follow-up preserves distinct warning-confirmation styling through the owned semantic warning Button variant, with variant and pending-state regression coverage. |
| [#992](https://github.com/tjorim/champagnefestival/issues/992) | Completed | 2026-09-17 | PR #1015; [decision](decisions/992-live-public-render.md); infra `tjorim/apps#209` | Live metadata, JSON-LD, FAQ/schedule and published privacy content, with locale-specific 60-second caching, transactional invalidation and last-known-good fallback. Infrastructure routes the two public paths to the API with a frontend mount and static fallback on 404. #1419 hides disposable server fragments before first paint when JavaScript runs, retaining readable no-JavaScript content (Lighthouse mobile verification pending). #1418 extends rendering to English/French home and privacy paths; deploy the additive routing in `tjorim/apps#296` before releasing the new sitemap and hreflang URLs. Updated 2026-10-27 (PR #1441): the live head preloads the hero photo and the event JSON-LD publishes one `Offer` per distinct required product (price, availability) instead of a placeholder. |
| [#1006](https://github.com/tjorim/champagnefestival/issues/1006) | Completed | 2026-09-12 | PR #1037; [decision](decisions/1006-volunteer-identity-self-service.md); [unified page decision](decisions/unified-self-service-page.md) | Volunteer self-registration and direct eID correction with checksum validation, linked identity and admin override, available on unified `/me`. Per-edition meal/dinner options and volunteer-owned selections were added on 2026-09-15. |
| [#1021](https://github.com/tjorim/champagnefestival/issues/1021) | Completed | 2026-09-11 | #1021, follows #802 and PR #1018 | Added an immutable `layout_revisions` table (geometry-only snapshot of tables/areas/room, allocations excluded) numbered per layout under a parent-row lock; REST/MCP save, list, get, compare, restore-preview, and restore endpoints matching snapshot objects by stable id; a restore preview that blocks deleting/moving an allocated table or an organization-assigned area unless the caller sets `resolve_allocations`, never itself touching registrations/organization assignments; audit events for save/restore; retry-safety documentation; and admin UI (save/list/compare/restore) alongside the pre-existing cross-date plan comparison, whose scope is now labelled explicitly in the UI. |
| [#932](https://github.com/tjorim/champagnefestival/issues/932) | Completed | 2026-09-07 | PR #1011; [decision](decisions/932-multi-worker-state.md) | PostgreSQL check-in limits and transactional live updates; per-process metrics labelled. One API worker accepted on 2026-09-08; further scaling is not planned. |
| [#934](https://github.com/tjorim/champagnefestival/issues/934) | Completed | 2026-09-07 | PR #1010; [decision](decisions/934-data-retention-and-erasure.md) | Admin anonymisation, restricted NISS/eID reads, consent capture and VPS audit-IP cleanup. Owner publication of privacy text remains separate. |
| [#941](https://github.com/tjorim/champagnefestival/issues/941) | Completed | 2026-09-07 | PR #1014; [decision](decisions/941-web-push-foundation.md) | Anonymous device-scoped push consent, subscriptions, admin test delivery and expiry/retirement. Browser rotation events remain unsupported. |
| [#942](https://github.com/tjorim/champagnefestival/issues/942) | Completed | 2026-09-07 | PR #1016; [decision](decisions/942-central-composer.md) | Announcement/push composer with dispatch-time audience, validation, confirmation and outbox results. All-subscriber targeting only; no bulk email. Updated 2026-10-19: draft create/edit dialogs with guarded dismissal and stable form baselines during polling. |
| [#936](https://github.com/tjorim/champagnefestival/issues/936) | Superseded | 2026-09-05 | #936, PR #990 | Static SEO/PWA corrections in #990; live rendering split into #992. |
| [#944](https://github.com/tjorim/champagnefestival/issues/944) | Completed | 2026-09-04 | #944; Git history | Versioned, sanitised policy drafts/publication, locale enforcement and audit trail. |
| [#937](https://github.com/tjorim/champagnefestival/issues/937) | Completed | 2026-09-03 | #937, PR #975 | QR scanning and connectivity feedback. Offline queues intentionally excluded. |
| [#945](https://github.com/tjorim/champagnefestival/issues/945) | Completed | 2026-09-02 | #945; Git history | Localised announcements with publish windows, safe links, admin preview and urgent-only live alerts. Updated 2026-10-19: create/edit dialogs with guarded dismissal, translated save failures and list refresh after saving. |
| [#935](https://github.com/tjorim/champagnefestival/issues/935) | Completed | 2026-09-02 | #935; Git history | Themed confirmations, accessible mutation feedback, translation fixes and reduced React warnings; 11 documented warnings remain. |
| [#943](https://github.com/tjorim/champagnefestival/issues/943) | Completed | 2026-09-01 | #943; Git history | Localised individual email-client actions and communication preferences; no bulk sender. |
| [#933](https://github.com/tjorim/champagnefestival/issues/933) | Completed | 2026-09-01 | #933; Git history | Capacity-safe party-size edits, order recalculation, accessibility needs and registration deadlines. The `Event.max_capacity` headcount cap this introduced was removed on 2026-09-15 (Git history) as redundant: every registration-required event now gates entry through a required purchasable product, so that product's own `stock` is the sole capacity/sold-out signal — a bare headcount cap with no product to attach it to never had a legitimate use once open (no-registration) and restricted (product-gated) events were the only two shapes. Added the same day: a per-product visitor waitlist (`POST /api/waitlist`, admin queue at `GET`/`PUT .../handled`/`DELETE /api/waitlist{,/{id}...}`) for a sold-out product — a manually-worked, oldest-first queue with no automated promotion or notification, mirroring `app.routers.contact`'s client-generated-UUID shape rather than the REST/MCP-shared services elsewhere in this codebase. |
| [#931](https://github.com/tjorim/champagnefestival/issues/931) | Completed | 2026-09-01 | #931; Git history | Bounded list APIs, server-paginated registrations, full-filter exports/bulk actions and client pagination for smaller admin datasets. |
| [#926](https://github.com/tjorim/champagnefestival/issues/926) | Completed | 2026-08-30 | #926; Git history | Removed the dead table reservation column, derived non-cancelled occupancy from registrations, and shipped a volunteer read-only floor plan linked from check-in. |
| [#927](https://github.com/tjorim/champagnefestival/issues/927) | Completed | 2026-08-30 | #927; Git history | Made the table type the single stored soft capacity source, added locked guest-capacity checks across REST/MCP assignment, preserved plan type editing, and added confirmation, audited override, and distinct overfilled styling. |
| [#928](https://github.com/tjorim/champagnefestival/issues/928) | Completed | 2026-08-30 | #928; Git history | Re-resolved admin/MCP order edits against event products, preserved clamped delivery state, and restricted volunteer edits to validated delivery counts. |
| [#929](https://github.com/tjorim/champagnefestival/issues/929) | Completed | 2026-08-30 | #929; Git history | Triggered blanket cache recovery on each server `ready` frame, before consuming later stream events, including the first connection for restored tabs. |
| [#930](https://github.com/tjorim/champagnefestival/issues/930) | Completed | 2026-08-30 | #930; Git history | Applied one shared spreadsheet-formula guard to every backend registration and volunteer CSV cell, aligned it with the frontend rule, and added export regression coverage. |
| [#922](https://github.com/tjorim/champagnefestival/issues/922) | Completed | 2026-08-30 | #922; Git history | Attached authenticated bookings at creation, added email-proven ownership claims for older unowned bookings, and made owned registrations available to the web and Pebble self-service reads without trusting OIDC email claims. |
| [#947](https://github.com/tjorim/champagnefestival/issues/947) | Completed | 2026-08-30 | #947, PR #952 | Added a durable database-backed outbox, atomic token-bound worker claims, bounded retries, delivery diagnostics and retention, plus independently supervised worker deployment wiring. |
| [#924](https://github.com/tjorim/champagnefestival/issues/924) | Completed | 2026-08-30 | #924, PR #952 | Queued confirmations for public and admin bookings and provided guests with booking references, QR/check-in access, calendar links, and order details through email and the protected guest view. |
| [#940](https://github.com/tjorim/champagnefestival/issues/940) | Completed | 2026-08-29 | #940, PR #951 | Added validated, audited public contact settings with a translated admin form and shared last-good/fallback rendering across contact, maintenance, and privacy pages. |
| [#923](https://github.com/tjorim/champagnefestival/issues/923) | Completed | 2026-08-29 | #923, PR #950 | Persisted retry-safe contact submissions before success, added best-effort organiser notification and scoped limiting, exposed an admin inbox with idempotent handling, and corrected public error surfacing. |
| [#938](https://github.com/tjorim/champagnefestival/issues/938) | Completed | 2026-08-29 | #938, PR #948 | Corrected the backend API and SMTP documentation, removed shipped event CRUD and CSV exports from the backlog, and replaced speculative implementation plans with the canonical audit link. |
| [#921](https://github.com/tjorim/champagnefestival/issues/921) | Completed | 2026-08-29 | #921, PR #948 | Split public-operation buckets, keyed QR check-in limits per registration with a high shared-IP backstop, and added same-IP event-day regression coverage. |
| [#939](https://github.com/tjorim/champagnefestival/issues/939) | Completed | 2026-08-29 | #939, PR #948 | Blocked cancelled registrations across QR, volunteer, and admin check-in paths; rotated cancellation tokens; and disabled cancelled entrance actions in the volunteer UI. |
| [#925](https://github.com/tjorim/champagnefestival/issues/925) | Completed | 2026-08-29 | #925, PR #949 | Kept the last good maintenance value, distinguished HTTP client failures from outages, backed off failed polling, added response caching, and added regression coverage. |
| [#946](https://github.com/tjorim/champagnefestival/issues/946) | Completed | 2026-09-08 | #1014, #1016; issue completion checklist | Communications epic closed after its final child implementations merged. |

## Historical context

Archived findings and acceptance criteria explain past work; they do not
limit future scope. Revise current requirements when needs change, following
[using design guidance](README.md#using-design-guidance).

The original audit reviewed `f392ab9` (`2026.8.2`). Its frontend checks were
run; backend findings were initially static analysis because that environment
had no PostgreSQL. Those results are historical evidence, not a current
repository health claim.

The original findings, specifications and implementation history remain in
Git at `88396baf3275ae40cdd907239a0df6a04baed137`. Consult them for historical
context, not as a checklist of current or future obligations. Current source contracts are indexed in [docs/README.md](README.md).

## Signage epic (#1260)

Repository implementation complete 2026-10-18; the venue rehearsal remains open.
Sub-issues #1261–#1265 are closed, as is the separate MP4 export #1349 (which does
not add video slides or audio). Decisions on the epic's open questions:

- **Urgent interrupts:** out of scope. Screens poll every 30 seconds and apply a
  new revision at the next cycle boundary (#1264).
- **Video slides:** not in scope for now (no clip slide type; may be revisited); #1349 exports a frozen one-cycle MP4 only.
- **Notice text:** one free title and one free text box, no `_nl`/`_fr`/`_en` fields.
  Organisers type any languages they want into the box and they render as typed.
  This replaced the earlier per-language stacking before the first release.

Acceptance criteria mapping:

- [x] Producers, vendors and sponsors appear without re-entry, sponsors with the translated badge; notices are added and scheduled in Content → Screen channels (#1264).
- [x] Template design (background, bound placeholders, stickers) with a draft preview through the shared renderer before publication (#1263, #1264).
- [x] Last known playlist keeps looping offline; wake lock requested behind **Start screen** and re-requested when the tab returns (#1262, implementation).
- [x] Frontend signage unit tests (26) pass; backend and E2E suites passed in the sub-issue deliveries recorded above.
- [ ] Two laptops show the same slide within about one second with one wrong clock, and screens stay awake past the OS sleep timeout. Implemented (offset from lowest-round-trip samples, tested with a wrong device clock) but still needs the physical rehearsal in [signage setup](signage-setup.md#rehearsal-required-before-event-use).


## Signage player follow-up (#1262)

Implementation status: 2026-10-15; venue acceptance remains open.

The public `/signage/{channel}` player now consumes the playlist/time API from
#1260, with a reusable canvas renderer, monotonic corrected clock, boundary
revision changes, translated start controls, wake lock and production-worker
caching. Cuts and an always-visible status dot settle the proposed display
choices. This remains partial until the multi-laptop acceptance rehearsal in
[signage setup](signage-setup.md) is completed, including actual sleep prevention
and offline reload on venue hardware. The editor can reuse `SlideRenderer`.

## Signage template editor (#1263)

Completed 2026-10-16; navigation and editing updated 2026-10-19 in PR #1356 to group templates with channels and use explicit create/edit dialogs. The layer panel now lists frontmost layers first beside the canvas, with drag/keyboard ordering and row visibility/locking. Direct placeholder choices and an add-missing action simplify setup; selected-layer properties are grouped by content, appearance and position and show only relevant fields. All layer changes remain undoable drafts until explicit save. Channel/template navigation uses generated shadcn base-vega line tabs with compact icon labels and accessible keyboard navigation; the same component/line variant is shared with Announcements and People, and public Schedule/Account retain their runtime-theme mode. The editor lives under Content → Screen channels → Screen
templates and reuses `SlideRenderer`; the schema gains backwards-compatible layer
metadata, visibility, locking, font, alignment and image-fit defaults. The
[layer contract](signage-layer-contract.md) documents geometry, required bindings,
the Arial/Georgia/monospace font list, Lucide/uploaded stickers and the decision
to keep geometry exclusively in templates. Existing organisation and slide records
provide preview content with the same translation fallback as the player.

- [x] Custom backgrounds, logo/name placeholders and stickers render with existing content.
- [x] Frontmost-first layer panel with drag and keyboard ordering, row visibility/locking, direct placeholder choices, add-missing restoration and contextual properties; 1,187 frontend unit tests and the four-case authenticated editor run (setup, existing editor flow, desktop/mobile layer controls) pass, including axe accessibility checks at both widths.
- [x] Missing required visible bindings are flagged before saving for a preview kind; the service rejects assignment and shared-template edits that violate slide requirements.
- [x] Editor and player use the same renderer and tested top-left coordinate contract.
- [x] Frontend lint, formatting, typecheck/build and the full unit suite pass. All 373 other browser cases passed in the full run; the editor case passed after correcting an ambiguous rotation-field test locator. The latest targeted suite has 12 frontend signage tests; 14 backend signage tests and backend lint/format/typecheck pass.


## Signage channels and playlist editor (#1264)

Updated 2026-10-19: channel details and slides open in the shared admin dialogs;
creation and editing have explicit titles, Save/Cancel and dirty-dismissal confirmation.
The selected channel’s playlist and export actions stay in the section.

Completed 2026-10-17. Content → Screen channels manages edition-bound channels,
public links and active flags. The playlist supports producers, vendors and
sponsors separately (existing all-organisation blocks remain supported), translated
notices and uploaded images. Compatible templates come from #1263. Explicit saves
publish each change; drag handles and arrow buttons save a complete playlist order.

The authenticated, read-only preview projects drafts with the same organisation
expansion and schedule rules as the public API, including inactive channels. It
plays through `SlideRenderer`, reports expanded duration/count, and respects slide
active flags and the selected preview instant. Local schedule inputs become
timezone-aware API timestamps. Notices are a single free title and text, typed as the organiser wants them shown
(changed 2026-10-18; the earlier per-language stacking was dropped). Public screens poll every 30 seconds, with a five-second API cache,
and apply content revisions at a cycle boundary. Urgent interruptions remain out
of scope. #1265 reuses this published channel/playlist contract for frozen PNG and offline exports; #1262's venue
hardware rehearsal remains a separate acceptance gate.

- [x] Producers, vendors, sponsors and notices can be added, reordered and timed.
- [x] Active flags and schedule boundaries filter both previews and public playlists.
- [x] Channel links can be copied and opened in the public player.
- [x] Draft playback uses the shared renderer without publishing changes.
- [x] English, Dutch and French UI, targeted unit/backend tests and authenticated Playwright/axe coverage.
- [x] Frontend lint, formatting and production build (including typecheck); 1,163 tests in the full unit run, followed by 21 focused final regression checks; all 375 Playwright cases and 1,626 backend tests pass. Backend delivery tests use both `DATABASE_URL` and `TEST_DATABASE_URL` pointed at the local test database.

See [retry safety](retry-safety.md#channels-and-playlist-editor-1264) for explicit-save
and uncertain-response handling. This records repository implementation, not a
production deployment or completion of the venue rehearsal.


## Signage exports (#1265)

Completed 2026-10-18. Channel admin downloads the currently published playlist
as a local-folder HTML player with frozen PNG slides and JSON, or as a PNG-only
ZIP. The existing renderer and epoch/duration clock are reused. Building the bundle
is justified by cold offline startup, which service-worker caching cannot guarantee.
See [setup and rehearsal](signage-setup.md#cold-start-offline-exports-1265).

- [x] Local-folder playback without network access; timing follows the system clock.
- [x] Shared-renderer 1920×1080 images, also used directly in offline playback.
- [x] Frontend lint, formatting, translation parity and production build/typecheck pass; all 1,169 unit tests and the authenticated offline export browser test pass. A pagination timeout in the first full run passed on targeted and full reruns.

This records repository implementation; the two-laptop venue rehearsal remains
required before event use.


CI follow-up for PR #1350 (2026-10-18): generated HTML is now a raw template
and player JavaScript is emitted from typed, self-contained functions. The locale
audit checks the export code without exclusions, and the exported page title uses
the translated start label. Locale audit, formatting, lint, export regression tests,
offline browser playback and production build/typecheck pass.

## Video export implementation and activation (#1349)

Application integration implemented 2026-10-18, activation/venue validation pending. [#1349](https://github.com/tjorim/champagnefestival/issues/1349)
is the separate MP4 follow-up excluded from #1265. Browser-rendered PNGs and a
frozen published duration manifest go through an authenticated background export
job to [apps#273](https://github.com/tjorim/apps/issues/273), a shared private media
worker. No server-side Chromium is required. [Travel #457](https://github.com/tjorim/travel/issues/457)
migrates its existing video derivatives to a separate profile on the same worker.

Preferred delivery order: worker contract and profiles, Travel privacy/output
parity and production cutover, then Champagnefestival MP4 activation. The contract
and worker are now available in [apps commit cbb88ec](https://github.com/tjorim/apps/commit/cbb88ec9f19d1ea3e429ad9e1e7b8679239379ad).
The adapter uses that v1 contract and remains opt-in. Review hardening for
#1352 bounds preparation to 45 minutes (including admission, upload/submit and
cleanup) and makes malformed worker responses back off without blocking other
exports; lifecycle regressions cover both cases.
The synchronized HTML and PNG exports remain independent of this service.

- [x] Shared worker v1 contract, limits and durable lifecycle available (apps cbb88ec).
- [ ] Production wiring, private storage mount and Travel parity/cutover verified.
- [x] Admin-only snapshot/upload, durable jobs, translated progress/errors and private MP4 download implemented with documented retry safety (migration `008`; `signage_video` adapter and lifecycle tests).
- [x] Local real-worker 1080p output matches PNG captures; ffprobe and frame-by-frame/Chromium checks cover cuts/final hold and one-slide output. Postgres lifecycle tests cover privacy, cancellation, restart, expiry and outages. Local encoder: ffmpeg 8.1.3; production uses the worker’s pinned 8.0.1 image and still needs rehearsal.
- [x] Local frontend/backend checks and signage admin browser tests pass (1,676 backend tests; 36 final signage checks including real encoding; 1,170 frontend tests plus capture-cancellation regression; production build, typecheck, lint and formatting).
- [ ] Representative venue tooling/playback and production pinned-encoder rehearsal pass.

The full scope and acceptance criteria remain in #1349. This section records
partial delivery and does not mark the video feature complete or change #1265's
original HTML/PNG scope.
