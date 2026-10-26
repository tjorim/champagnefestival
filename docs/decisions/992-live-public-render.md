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
`/privacy` includes the published policy for the requested locale. `/en` and `/fr`
select the home-page language; `/en/privacy` and
`/fr/privacy` select the privacy language (#1418). Unprefixed render routes
use Dutch. Query-string locale selection has been removed: the site had not
gone live, so no compatibility aliases or redirects are needed. The client
retains saved/browser-language fallbacks on unprefixed pages. Canonical,
Open Graph and hreflang URLs use the matching document paths.

Interpolated text and attributes are escaped. Policy Markdown uses the shared
sanitising renderer. JSON-LD escapes script-breaking characters. Server fragments
provide readable content; they do not reproduce the interactive UI or require
React hydration. Their wrapper styling is independent of Bootstrap.

### Pre-mount visibility (#1419)

The server fragment wrapper has the `site-server-content` class. An inline
`components` layer rule in the frontend shell hides it with `display: none`
when `html[data-visual-theme]` is present. The existing synchronous theme
bootstrap sets that attribute in the head, before the body can paint. This
prevents unstyled fallback text from flashing and shifting the page when React
replaces it. The rule targets only the disposable fragment, not React's root.

Without JavaScript the attribute is absent, so FAQ/schedule and published policy
text retain their readable inline layout. The text remains in the HTML response
for crawlers; JavaScript-rendering crawlers see the final application content.
We retain `createRoot`: reproducing the interactive UI on the server for hydration
would be a substantially larger change. First contentful paint now reflects the
application appearing; eager-bundle performance is separate work.

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
Caddy must route `/`, `/privacy`, `/en`, `/fr`, `/en/privacy` and `/fr/privacy`
to the API, with a fallback to its static file server on a backend 404; other frontend paths retain normal SPA routing.
The production stack lives in the separate infrastructure repository.

Deploy the additive routing in [tjorim/apps#296](https://github.com/tjorim/apps/issues/296)
before releasing #1418’s path-based hreflang and sitemap. The sitemap lists
all six documents with reciprocal language alternates.
