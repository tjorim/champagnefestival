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

Delivered and terminally failed jobs, including their cascading attempt rows,
are retained for 90 days by default and cleaned daily. Pending/processing jobs
are never removed. Issue #934 may revise the window when the broader retention
schedule is approved.

Configuration:

- `FRONTEND_URL`: public origin used in check-in links.
- `OUTBOX_POLL_SECONDS`: idle polling interval (default 2 seconds).
- `OUTBOX_LEASE_SECONDS`: crash-recovery lease (default 300 seconds).
- `OUTBOX_RETENTION_DAYS`: terminal job retention (default 90 days).
