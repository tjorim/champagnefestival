# Documentation guide

Start with the document that owns the question; avoid copying its contract
into another planning file.

| Need | Source |
| --- | --- |
| Setup and development | [Repository README](../README.md), [backend README](../backend/README.md), [agent commands](../AGENTS.md) |
| Production deployment and release | [Deployment](../DEPLOYMENT.md), [release runbook](../RELEASE-RUNBOOK.md) |
| Remaining product work and completion history | [Product audit](product-audit-2026-08.md) |
| Write retries and delivery operations | [Retry safety](retry-safety.md), [outbox worker](outbox-worker.md) |
| Authorization and external integrations | [Authorization model](authorization-model.md), [operational lookup](integrations/OPERATIONAL_LOOKUP.md), [local MCP server](integrations/LOCAL_MCP_SERVER.md) |
| Floor-plan geometry | [Coordinate contract](floor-plan-coordinates.md) |
| API process count and shared state | [Single-worker decision](decisions/932-multi-worker-state.md) |
| Retention, anonymisation and consent | [Retention decision](decisions/934-data-retention-and-erasure.md) |
| Service-worker ownership and browser push | [Web Push foundation](decisions/941-web-push-foundation.md) |
| Announcement/push composition and dispatch | [Composer decision](decisions/942-central-composer.md) |
| Unfinished visitor-account and rendering work | [Visitor sessions](decisions/953-visitor-passwordless-session.md), [public rendering](decisions/992-live-public-render.md) |
| Frontend data-layer choice | [TanStack DB decision](decisions/tanstack-db.md) |

Fixtures, event data and Play Store assets are functional inputs or publishing
artifacts, not disposable planning documents. Keep them with their consumers.

Decision documents record final choices, reasoning and known limits. Keep
code comments self-contained; link back to a decision only when its broader
rationale helps prevent a mistaken change. Documentation should point to the
implementation it explains. Original proposals
and lengthy implementation history live in Git and the historical links in
each consolidated document. Keep detailed plans for unfinished work until its
acceptance gates are satisfied.

## Implementation pointers

- Shared limits and notifications: [rate limits](../backend/app/ratelimit.py),
  [publication](../backend/app/live/notify.py), [listener](../backend/app/live/listener.py).
- Retention: [person service](../backend/app/services/people_service.py);
  production cleanup jobs live in the infrastructure repository.
- Push: [delivery](../backend/app/push.py), [browser subscription hook](../frontend/src/hooks/usePushSubscription.ts),
  [shared service worker](../frontend/src/sw.ts).
- Composer: [draft lifecycle](../backend/app/services/composer_service.py),
  [dispatch and delivery](../backend/app/composer_delivery.py).
- Public rendering: [routes](../backend/app/routers/public_pages.py),
  [shell rendering](../backend/app/services/public_render.py),
  [render cache](../backend/app/services/public_render_cache.py).
