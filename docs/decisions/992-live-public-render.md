# Live backend rendering of `/` and `/privacy` (#992)

Implemented in PR #1015. Infrastructure routing and the frontend mount shipped
in `tjorim/apps#209`. The backend serves live metadata and crawler-visible content
from database state; React replaces the fallback content when it mounts.

## Shell and content

The frontend build owns the document, theme bootstrap and hashed asset names.
The backend reads `index.html` from `FRONTEND_DIST_PATH` (default `../frontend/dist`),
rechecking its modification time so frontend deployments are picked up without
an API restart. Missing or unreadable builds return 404.

`<!--ssr:head-->` and `<!--ssr:content-->` are fragment slots. Existing title,
description, Open Graph, Twitter, canonical and language metadata are rewritten
rather than duplicated. `/` includes active-edition metadata and FAQ/schedule text;
`/privacy` includes the published policy for the requested locale. `?lng=nl|en|fr`
selects the language, with Dutch as the default for unsupported values.

Interpolated text and attributes are escaped. Policy Markdown uses the shared
sanitising renderer. JSON-LD escapes script-breaking characters. Server fragments
provide readable content; they do not reproduce the interactive UI or require
React hydration. Their wrapper styling is independent of Bootstrap.

The server marks its JSON-LD with `data-ssr-jsonld="true"`; the client suppresses
its duplicate when that marker exists. Both builders share the
[edition fixture](../fixtures/jsonld-edition.json), with contract tests using
Europe/Brussels time. Tests also compare backend translation snippets to the
frontend messages to prevent drift.

## Cache and invalidation

Renders are cached per route and locale for 60 seconds, with
`Cache-Control: public, max-age=60`. Relevant FAQ, edition/event and policy
publication writes emit PostgreSQL `NOTIFY` in their transaction. A dedicated
listener expires cached renders across API processes. Policy draft saves do not
invalidate published content. TTL remains the freshness bound if a notification
is missed.

Failed refreshes serve the last successful render and log the failure. Cold-cache
failures propagate when no successful value exists. These read routes introduce
no application write or automatic write retry.

## Deployment

The API needs a read-only mount of the same frontend build Caddy serves.
Caddy routes exactly `/` and `/privacy` to the API and falls back to its static
file server on a backend 404; other frontend paths retain normal SPA routing.
The production stack lives in the separate infrastructure repository.
