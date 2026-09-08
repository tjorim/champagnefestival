# Central announcement and Web Push composer

**Status:** Implemented in #1016 (2026-09-07); #942 closed.

## Confirmed decisions

Reuse `Announcement` and its service for the in-app channel, including the
`info`/`warning`/`urgent` levels. Keep the simpler announcement editor as a
separate entry point. Supported channels are explicitly selected announcement
and Web Push; the only push audience is all opted-in subscribers.

### Snapshot timing

Resolve the audience at dispatch time, including for scheduled messages.
The compose-time count is an estimate. Persist subscriber IDs and the actor
with the sent message; never expose subscriber endpoints or keys in results.
Each push job uses the composite resource ID `message_id:subscription_id`.

## Implementation summary

`ComposedMessage` has `draft` → `scheduled` → `sent` states. Drafts are editable;
scheduled/sent messages are not. `POST /api/composer/{id}/schedule` locks the
row and atomically schedules one `composer_message_dispatch` outbox job.
When the request omits `scheduled_at`, both the message and job receive the
current UTC time. “Publish now” therefore runs on the next worker poll, not
in a fourth state or directly in the HTTP request.

Dispatch locks the message, creates the selected announcement through
`announcements_service._create_uncommitted`, snapshots the current audience,
and enqueues one `composer_message_push` job per subscriber before committing
`sent`. Repeat dispatch is a no-op; per-recipient deduplication keys also
prevent duplicate enqueueing. Later push failures do not undo the announcement.

Push delivery remains at-least-once: a worker crash after external delivery
can cause a retry. “Sent” means dispatch committed, not that every device
received a notification. Aggregate delivered/failed/pending counts reflect
outbox outcomes; a retired subscription also counts as a completed job.
See [retry safety](../retry-safety.md) for the exact guarantees.

Create, merged updates, and scheduling require at least one complete locale
title/body pair. Delivery selects the requested complete pair, then Dutch,
English or French; it never mixes languages. Push validation and delivery
share the JSON serializer and 4096-byte limit in `app/composer_content.py`.
Non-push content keeps its character limits without the push byte restriction.

The admin form displays locale text, channels and estimated audience and
requires confirmation before sending. Pending saves block repeat submissions;
scheduling failures are visible. Browser mutations do not automatically retry.
Admin scheduling uses a local rate limit under the
[one-worker decision](932-multi-worker-state.md).

## Scope and known limits

No category/event audience selection, bulk email, or separate server preview
endpoint was built. The original configurable audience-size cap was a proposal,
not an implemented guarantee. Preview uses plain form text; delivery applies
the complete-pair fallback above. The API supports future scheduling; the
current UI sends with an empty scheduling body (“now”).

Tests: `backend/tests/test_composer.py` and
`frontend/tests/components/admin.ComposerManagement.test.tsx` cover validation,
state transitions, audience timing, delivery outcomes, repeat-submit protection,
error handling and accessibility. Shared delivery rules are in the
[Web Push decision](941-web-push-foundation.md).

## Historical context

Consolidated 2026-09-08. The [full pre-consolidation document](https://github.com/tjorim/champagnefestival/blob/88396baf3275ae40cdd907239a0df6a04baed137/docs/decisions/942-central-composer.md) preserves the original findings, proposals, acceptance criteria, and implementation history.
