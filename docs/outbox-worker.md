# Durable outbox worker

Run one or more workers separately from the API process:

```bash
cd backend
uv run python -m app.worker
```

`docker compose up backend worker` runs both development processes. Production
must run the same worker command as a separately supervised service using the
same database and SMTP configuration as the API.

Jobs are inserted in the same transaction as their business record. Workers
claim one ready row with `FOR UPDATE SKIP LOCKED`, commit an expiring lease,
perform the external operation without holding a database lock, and record a
non-secret attempt result. An expired lease is eligible for another worker,
so process termination does not strand work. Each lease has a unique claim
token, and stale workers cannot record results after a job is reclaimed.
Failures retry after bounded
exponential backoff (one minute through one hour) and become terminal after
five attempts; one terminal job does not block later jobs.

The deduplication key prevents two jobs for the same logical side effect.
SMTP cannot provide exactly-once delivery after an ambiguous network failure,
so confirmation delivery is explicitly **at least once**: recovery may send a
duplicate, but never loses the durable booking or its job. Logs, admin
`GET /api/outbox`, audit entries, and delivery-attempt rows contain identifiers
and error classes, not addresses, tokens, message bodies, or SMTP credentials.

`GET /api/outbox` lists jobs newest first, optionally filtered by `state`, as a
paged `{items, total, limit, page}` envelope (200 per page by default, up to
1000). `total` counts every matching job, so a caller reads them all by paging
instead of getting a silently truncated list.

Delivered and terminally failed jobs, including their cascading attempt rows,
are retained for 90 days by default and removed by the daily housekeeping
command (below). Pending/processing jobs are never removed. Issue #934 may revise the window when the broader retention
schedule is approved.

Configuration:

- `FRONTEND_URL`: public origin used in check-in and organization-review links.
- `ORGANIZATION_REVIEW_RECIPIENT`: optional single shared mailbox for organization
  proposal notifications. Empty skips queueing; a configured recipient is
  snapshotted per submission. See [organization review](organization-change-review.md).
- `OUTBOX_POLL_SECONDS`: idle polling interval (default 2 seconds).
- `OUTBOX_LEASE_SECONDS`: crash-recovery lease (default 300 seconds).
- `OUTBOX_RETENTION_DAYS`: terminal job retention (default 90 days).

## Housekeeping

The worker only delivers jobs. Cleanup runs once per invocation of a separate
command, which the VPS schedules daily (`tjorim/apps`, systemd timer):

```bash
cd backend
uv run python -m app.maintenance housekeeping
```

It removes terminal outbox jobs past `OUTBOX_RETENTION_DAYS`, stale
rate-limit buckets, expired visitor sessions and magic links, and push
subscriptions with no successful delivery in `PUSH_SUBSCRIPTION_EXPIRY_DAYS`.
Each sweep runs in its own session and is idempotent; a failing sweep is logged
and does not skip the others, and the command exits non-zero if any failed.
