# Product audit and remaining work

Updated 2026-09-09. This is the current scope, dependency and preferred-order
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

The two implementation-ready follow-ups retain their previous order. #802 has
owner-agreed design guidance with one open organiser question; #1006 still
needs design clarification. Their separate listing does not assign a new priority.

| Order | Issue | Current status and remaining acceptance gates |
| --- | --- | --- |
| 1 | [#953 — visitor passwordless accounts](https://github.com/tjorim/champagnefestival/issues/953) | Session and order-history implementation merged in #1012. Verify production transactional email end to end before enabling the localised public **My orders** navigation. Publish the corresponding privacy/account copy. See [decision](decisions/953-visitor-passwordless-session.md). |
| 2 | [#992 — live public rendering](https://github.com/tjorim/champagnefestival/issues/992) | Repository implementation merged in #1015. Complete the infrastructure routing for `/` and `/privacy` and mount the built frontend shell into the API, then verify live content and locale/cache behavior in production. See [decision](decisions/992-live-public-render.md). |

### Active implementation and work needing scope decisions

- [#802 — bourse seating model](https://github.com/tjorim/champagnefestival/issues/802): [owner-agreed booking/product guidance](decisions/802-booking-products-and-seating.md) covers event-owned plans, manual/partial allocation with guest counts per table for split festival bookings, optional stock, booked prices, nested included products and shared notes. The three implementation increments now provide inventory/packages, multi-room event plans, split/shared/exclusive allocations, and a combined booking/payment/quantity editor. The editor previews totals and payment differences and requires the administrator to choose which table to release before an over-allocated quantity reduction can be saved atomically. The plan itself supports adding, moving, changing guest counts and removing booking allocations from a selected table. Visitors can submit a change or cancellation request that leaves the booking active for an administrator decision; approval and reimbursement are not guaranteed. Capsule-exchange companion policy remains the only undecided scope; #802 stays open until that rule is confirmed or split out.
- [#1006 — volunteer identity self-service](https://github.com/tjorim/champagnefestival/issues/1006): requires a verified link from OIDC identity to a Person before exposing NISS/eID or accepting corrections. Decide review/approval and card-renewal behavior first. Low-priority follow-up; the existing admin-only point-in-time record remains intentional.

### Active acceptance gates

For #953:

- [x] Repository-side visitor sessions and owned order history implemented.
- [ ] Production email delivery verified end to end.
- [ ] Localised public navigation enabled after verification.
- [ ] Privacy/account copy published for the implemented session.

For #992:

- [x] Backend rendering, shared JSON-LD fixture, TTL/fallback and proactive invalidation implemented.
- [ ] Exact-path infrastructure routing and frontend-shell mount completed.
- [ ] Production HTML, locale variants, edit freshness and fallback verified.

## Dependencies and accepted boundaries

- #953's code prerequisites (#922, #924, #947) are complete; delivery verification is an operational gate.
- #992 uses #932's PostgreSQL notification pattern on its own render-cache channel. Its remaining dependency is infrastructure activation.
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
| [#932](https://github.com/tjorim/champagnefestival/issues/932) | Completed | 2026-09-07 | PR #1011; [decision](decisions/932-multi-worker-state.md) | PostgreSQL check-in limits and transactional live updates; per-process metrics labelled. One API worker accepted on 2026-09-08; further scaling is not planned. |
| [#934](https://github.com/tjorim/champagnefestival/issues/934) | Completed | 2026-09-07 | PR #1010; [decision](decisions/934-data-retention-and-erasure.md) | Admin anonymisation, restricted NISS/eID reads, consent capture and VPS audit-IP cleanup. Owner publication of privacy text remains separate. |
| [#941](https://github.com/tjorim/champagnefestival/issues/941) | Completed | 2026-09-07 | PR #1014; [decision](decisions/941-web-push-foundation.md) | Anonymous device-scoped push consent, subscriptions, admin test delivery and expiry/retirement. Browser rotation events remain unsupported. |
| [#942](https://github.com/tjorim/champagnefestival/issues/942) | Completed | 2026-09-07 | PR #1016; [decision](decisions/942-central-composer.md) | Announcement/push composer with dispatch-time audience, validation, confirmation and outbox results. All-subscriber targeting only; no bulk email. |
| [#936](https://github.com/tjorim/champagnefestival/issues/936) | Superseded | 2026-09-05 | #936, PR #990 | Static SEO/PWA corrections in #990; live rendering split into #992. |
| [#944](https://github.com/tjorim/champagnefestival/issues/944) | Completed | 2026-09-04 | #944; Git history | Versioned, sanitised policy drafts/publication, locale enforcement and audit trail. |
| [#937](https://github.com/tjorim/champagnefestival/issues/937) | Completed | 2026-09-03 | #937, PR #975 | QR scanning and connectivity feedback. Offline queues intentionally excluded. |
| [#945](https://github.com/tjorim/champagnefestival/issues/945) | Completed | 2026-09-02 | #945; Git history | Localised announcements with publish windows, safe links, admin preview and urgent-only live alerts. |
| [#935](https://github.com/tjorim/champagnefestival/issues/935) | Completed | 2026-09-02 | #935; Git history | Themed confirmations, accessible mutation feedback, translation fixes and reduced React warnings; 11 documented warnings remain. |
| [#943](https://github.com/tjorim/champagnefestival/issues/943) | Completed | 2026-09-01 | #943; Git history | Localised individual email-client actions and communication preferences; no bulk sender. |
| [#933](https://github.com/tjorim/champagnefestival/issues/933) | Completed | 2026-09-01 | #933; Git history | Capacity-safe party-size edits, order recalculation, accessibility needs and registration deadlines. |
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
