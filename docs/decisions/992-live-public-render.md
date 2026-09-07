# Live backend rendering of `/` and `/privacy`

**Status:** Implemented in this repository (2026-09-07) — see "Implementation
summary" below. **The `tjorim/apps` infra companion change has not been made
yet**: until it ships, Caddy continues to serve `/` and `/privacy` as static
files exactly as before, so this has no live effect in production yet — see
"What's not done" below.
**Date:** 2026-09-06 (confirmed 2026-09-07, implemented 2026-09-07)
**Issues:** [#992](https://github.com/tjorim/champagnefestival/issues/992)
(primary); [#936](https://github.com/tjorim/champagnefestival/issues/936)
(superseded parent — its "S" part shipped in PR #990, this document covers the
redefined "M" part); [#932](https://github.com/tjorim/champagnefestival/issues/932)
(multi-worker state — the cache decision below depends on it);
[#944](https://github.com/tjorim/champagnefestival/issues/944) (versioned
policy publishing — where `/privacy`'s body already comes from)

---

## Context

#992 settled the *direction*: render `/` and `/privacy` from the backend on
every request, because their content (active edition, FAQ, published privacy
policy) is live database state an admin edits without a redeploy, so neither
build-time prerendering nor a deploy-time crawl can stay current. It
deliberately left three questions open rather than picking silently:

1. Which templating approach a backend that has been a pure JSON API should
   adopt.
2. The cache TTL, and whether admin mutations should invalidate proactively
   rather than waiting it out.
3. Whether the server-rendered markup has to match the client-rendered version
   closely enough to avoid a re-render flash.

This document proposes answers to all three, plus two constraints the issue
did not surface, following the pattern of
[`932-multi-worker-state.md`](./932-multi-worker-state.md),
[`934-data-retention-and-erasure.md`](./934-data-retention-and-erasure.md), and
[`941-web-push-foundation.md`](./941-web-push-foundation.md): concrete
defaults, flagged for confirmation rather than treated as settled.

## Decision 1 — inject into the built shell; no template engine owns the document

**Confirmed 2026-09-07: marker replacement into `index.html` as built by Vite,
with per-fragment autoescaping. No Jinja2.**

The tempting FastAPI-idiomatic answer is Jinja2, and it is the wrong shape
here. The document being served is a *build artifact*: `frontend/index.html`
already carries `%VITE_SITE_TITLE%`/`%VITE_PUBLIC_URL%` placeholders that Vite
substitutes, and the built output references content-hashed asset filenames
(`/assets/index-<hash>.js`) that change every frontend build. A backend
template that owned the whole document would have to reproduce the shell —
the theme bootstrap script, the font preloads, the hreflang block, the hashed
script tags — and would silently drift out of date on the next `pnpm build`.

So the shell stays owned by the frontend, and the backend only fills in
reserved slots:

- Add HTML comment markers to `frontend/index.html` at the injection points
  (e.g. `<!--ssr:head-->` inside `<head>`, `<!--ssr:content-->` inside the
  `#root` fallback area). They are inert comments in the SPA's own dev/preview
  serving path, so nothing changes for `pnpm dev` or for any route the backend
  does not handle.
- The backend reads the built `index.html`, replaces each marker with a
  rendered fragment, and returns the result. Meta tags that already exist in
  the shell as static defaults (`description`, `og:*`, `twitter:*`,
  `<html lang>`, `<link rel="canonical">`) are *rewritten* rather than
  appended, so a crawler never sees two conflicting values.

**Escaping is the part worth being deliberate about.** Hand-concatenating HTML
strings is the classic route to an injection bug, and FAQ answers are
admin-authored free text (`faq_items.answer_nl` is plain `Text`, rendered by
the client as `<p>{item.answer}</p>` — i.e. escaped by React today). The
proposal is therefore *not* "f-strings and hope":

- Every interpolated value goes through one small, tested fragment builder
  that escapes by default (`html.escape` with `quote=True` for attribute
  contexts), rather than each call site remembering.
- Policy content is the one exception and already has a home: it is Markdown,
  and `app/services/policy_markdown.render_markdown` is the single
  renderer/sanitizer pair #944 established precisely so preview and public
  output cannot drift. The server render calls that, not a second renderer.
- JSON-LD is serialised with `json.dumps` and then has `<` escaped as `<`
  before being placed in a `<script>` block, so a `</script>` sequence in any
  string field cannot break out.

**Rejected alternatives.** *Jinja2 for the whole document* — drifts from the
build artifact, as above. *Jinja2 for fragments only* — its autoescaping is a
genuine benefit, but it buys one property this proposal gets from a ~30-line
escaping helper, in exchange for a new runtime dependency and a template
directory that would hold four small fragments. Worth revisiting if the
rendered surface ever grows past these two routes; not worth it for them.
**If the owner would rather pay one dependency for autoescape-by-default,
Jinja2-for-fragments is the fallback pick and nothing else in this document
changes.**

## Decision 2 — a short TTL is the correctness floor; proactive invalidation ships alongside it

**Confirmed 2026-09-07: a 60-second in-process TTL cache with a last-known-good
fallback, plus `NOTIFY`-based proactive invalidation, built together in this
change.** This corrects the original proposal below, which suggested
deferring invalidation as a follow-up — the project owner chose to build both
now since #932's `LISTEN`/`NOTIFY` bus already exists (shipped 2026-09-07),
rather than shipping a TTL-only cache and reopening this decision later.

This is the question with a dependency the issue did not draw out. #992
suggests invalidating proactively on the relevant admin mutations. That works
today only because the app runs exactly one worker — which is the precise
limitation #932 exists to remove. Under two or more workers, an admin's FAQ
edit reaches whichever worker served the mutation; that worker clears *its*
cache, and every other worker keeps serving stale HTML with nothing to correct
it. Proactive invalidation would be a correctness regression the moment #932
ships, and a silent one.

The ordering that survives both states — both pieces below ship in this same
change, since #932's bus already exists; the reasoning is kept because it's
still what makes the combination correct, not just a rollout plan:

- **TTL first, always.** A 60-second expiry bounds staleness regardless of how
  many workers run, and satisfies #992's acceptance criterion ("reflected on
  the next render within the documented cache TTL") on its own. An in-process
  cache is acceptable *specifically* because it is a pure cache: unlike #932's
  rate limiter (where per-worker state means the limit is wrong) or its live
  bus (where per-worker state means events are missed), each worker
  independently holding its own copy of a render costs an extra database read
  per worker per minute and nothing else. This distinction is worth stating
  explicitly so a future reader of #932 doesn't sweep this cache up with the
  state that genuinely has to move.
- **Proactive invalidation over `NOTIFY`, on top.** #932's Postgres
  `LISTEN`/`NOTIFY` bus already reaches every worker, so a publish on
  FAQ/edition/policy mutation is safe from the correctness regression
  described above from day one — no single-worker-only interim to pass
  through, so there is no reason to withhold it as a separate follow-up.
- **Never proactive-only.** Even with `NOTIFY`, the TTL stays, so a dropped
  notification degrades to one minute of staleness instead of unbounded.

**Last-known-good on failure.** #992 requires that a transient database
failure not 5xx the public homepage. The cache entry is therefore kept past
its expiry and served — stale — when a refresh raises, with the error logged;
only a cold cache with a failing database falls through to the unmodified
static shell, which is exactly today's behaviour and never worse than it. This
mirrors the frontend's existing treatment of public settings and maintenance
mode (#925, #940), where the last good value survives a failed refetch rather
than collapsing the page.

**Response headers.** `Cache-Control: public, max-age=60` to match the server
TTL, and the `?lng=` query parameter is part of the cache key on both sides
(distinct URLs, so no `Vary` gymnastics needed).

## Decision 3 — the backend owns JSON-LD for these two routes; a fixture keeps both sides honest

**Confirmed 2026-09-07, proceeding as originally proposed: the server-rendered
JSON-LD is the one a crawler sees; the client component stops emitting a
duplicate when one is already present.**

#992 flags that `frontend/src/components/JsonLd.tsx` (TypeScript) and a new
backend builder (Python) cannot share an implementation. There is a concrete
failure mode beyond drift: `EventStructuredData` injects its `<script
type="application/ld+json">` on mount, so once the backend renders one into
`<head>`, a crawler that executes JavaScript sees **two** Event objects.

- The server-rendered script carries a marker attribute (e.g.
  `data-ssr-jsonld`), and the client component renders nothing when it finds
  one in the document — falling back to its current behaviour on every route
  the backend does not render, and on client-side navigations.
- Against drift: a checked-in JSON fixture built from a fixed edition, with a
  backend test asserting the Python builder reproduces it and a frontend test
  asserting the TS component does. Divergence then fails a required check
  rather than being noticed by a search console months later. This is the same
  approach `docs/floor-plan-coordinates.md` takes for the coordinate contract
  — a written contract plus tests on both sides of it.

## Decision 4 — equivalent content, not a pixel match

**Confirmed 2026-09-07, proceeding as originally proposed: server-rendered
FAQ/schedule markup targets crawler-visible text and a non-embarrassing no-JS
page, and is allowed to be replaced wholesale when React mounts.**

#992's third open question asks whether the server markup must closely match
the client render to avoid a flash. Proposed answer: no, and the reasoning is
already in the issue — this is `createRoot` replacement, not `hydrateRoot`, so
there is no hydration-mismatch failure mode to design around. Chasing a visual
match would mean maintaining a second copy of the FAQ accordion and schedule
components in Python, which is exactly the duplication Decision 3 is trying to
bound to one small JSON object.

The mitigation is cheaper: render the server content inside the `#root`
element that React replaces on mount, styled with the existing Bootstrap
classes the page already loads. A visitor on a slow connection sees real,
readable, correctly-styled content that is then swapped for the interactive
version, rather than a spinner. If that swap turns out to be visibly jarring
in practice, it is a self-contained follow-up, not a reason to hold the SEO
fix.

## Constraint the issue did not surface — the backend needs the shell on disk

`AGENTS.md` records that production Caddy serves the frontend from
`/srv/champagnefestival`, while the backend runs as a separate service. The
backend cannot inject into a shell it cannot read, so #992's "small Caddyfile
routing change" is **not** the only infra change required: the infra stack in
`tjorim/apps` also has to expose the built frontend directory to the
`champagnefestival-api` container (a read-only bind mount of the same
directory Caddy serves is the obvious form).

Two consequences worth deciding with it:

- **The shell must be re-read, not cached at process start.** A frontend
  deploy replaces `index.html` and its hashed asset names while the backend
  keeps running; a shell cached at startup would serve `<script>` tags
  pointing at assets that no longer exist. Proposed: read it under the same
  60-second TTL as the render, keyed on the file's mtime.
- **A missing or unreadable shell must degrade, not crash.** If the mount is
  absent (a fresh environment, a local `uv run uvicorn` with no frontend
  build), the route returns a 404 and lets Caddy's existing `file_server`
  handle the path as it does today, rather than 500-ing the homepage. This
  also keeps backend tests and local development working without a
  `pnpm build` first.

## Retry-safety

Both routes are `GET`s that write nothing, so `docs/retry-safety.md` needs no
new entry — noted explicitly because `AGENTS.md` requires a documented
decision for every new or changed write operation, and "there is no write
here" is the decision.

## Implementation summary (2026-09-07)

Shipped per the confirmed decisions above:

- **`GET /` and `GET /privacy`** (`app/routers/public_pages.py`): read the
  built shell (`Settings.frontend_dist_path`, default `../frontend/dist`,
  re-read under the render cache's own TTL and keyed on the file's mtime —
  a missing/unbuilt directory 404s rather than crashing), rewrite
  title/description/og:\*/twitter:\*/canonical/`<html lang>` in place
  (`app/services/public_render.py`'s `rewrite_head_meta`, matched by
  attribute name so it works regardless of what Vite already substituted
  into `%VITE_*%` placeholders at build time), and inject two fragments into
  `<!--ssr:head-->` (the JSON-LD `<script>`) and `<!--ssr:content-->`
  (FAQ/schedule text, or the privacy policy body) — both markers added to
  `frontend/index.html`, inert everywhere else. Every interpolated value —
  FAQ questions/answers, event titles, policy titles — goes through a small
  `html.escape`-based helper (`_text`/`_attr`), not hand-concatenation,
  since that content is admin-authored, not developer-controlled; a
  dedicated test posts an XSS payload as a FAQ answer and asserts it comes
  back escaped.
- **Cache** (`app/services/public_render_cache.py`): an in-process
  `RenderCache` (60s TTL, keyed by `f"{route}:{locale}"`) with last-known-good
  — a refresh that raises falls back to the previous value if one exists,
  re-raising only on a cold cache (which the route then turns into a 404,
  not a 500). Proactive invalidation runs over its own Postgres NOTIFY
  channel (`public_render_invalidate`, not `live_events` — see 932's
  cross-cutting note that a render-cache invalidation is a different
  message shape than an SSE client's), relayed by a new
  `PgRenderCacheListener` (`app/live/render_cache_listener.py`) — a
  deliberate near-duplicate of `PgLiveListener` rather than a
  generalization of it, since the reconnect-with-backoff shape is identical
  but reworking already-shipped, tested #932 code carried more regression
  risk than the small duplication. `notify_render_cache_invalidate` is
  called before `db.commit()` in FAQ create/update/delete/reorder, edition
  create/update/delete, event create/update/delete, and policy *publish*
  only (not draft saves, which aren't publicly visible yet).
- **JSON-LD** (`app/services/jsonld_service.py`, decision 3): a Python
  builder mirroring `frontend/src/components/JsonLd.tsx` field-for-field,
  computing dates in a fixed `Europe/Brussels` timezone rather than a
  viewer's local time (the client's own render has no single "true" instant
  to reproduce — browser-local time varies per viewer). The shared contract
  is `docs/fixtures/jsonld-edition.json`: a backend test
  (`test_jsonld_service.py`) and a frontend test
  (`JsonLd.contract.test.tsx`, pinning its own timezone to Brussels to make
  the comparison meaningful) both build a JSON-LD Event from it and assert
  byte-for-byte equality with the same expected structure. `JsonLd.tsx`
  checks for a `[data-ssr-jsonld="true"]` script in the document and renders
  nothing if one is already there, so a crawler never sees two Event
  objects on `/`.
- **Translated strings**: `festival_name`/`welcome_subtitle`/`faq_title`/
  `schedule_title` are duplicated in `app/services/frontend_i18n_snippets.py`
  (this process only has `frontend/dist` mounted, not the `messages/*.json`
  source) — a test reads the real translation files and fails if they drift
  from the duplicated constants.
- **Tests**: 33 backend tests across `test_public_pages.py` (shell-missing
  404, meta rewriting, FAQ/schedule/JSON-LD content, XSS-safe escaping,
  locale handling including a real `?lng=fr` case, cache-hit reuse, a real
  NOTIFY-based invalidation round trip via a session-scoped listener
  fixture, and last-known-good under a simulated database failure),
  `test_public_render_cache.py`, `test_pg_render_cache_listener.py`
  (mirroring `test_pg_live_listener.py`'s reconnect-focused tests), and
  `test_jsonld_service.py`; 2 new frontend tests
  (`JsonLd.contract.test.tsx`).

## What's not done

- **The `tjorim/apps` infra companion change** (decision doc's own
  "Constraint the issue did not surface" section): the exact-path Caddy
  `handle` for `/` and `/privacy` routing to `champagnefestival-api`, and
  the read-only mount of the built frontend into that API container. Both
  land in that separate repository, not this one — this session has no
  access to it, so **this has not been done by anyone yet**, unlike #934's
  `tjorim/apps#192` (confirmed already closed when that work landed).
  Without it, Caddy's existing `try_files … /index.html` keeps serving `/`
  and `/privacy` as static files exactly as before; this repository's new
  routes are correct and fully tested but currently unreachable in
  production. Needs its own PR in `tjorim/apps` before this has any live
  effect.

## References

- [#992](https://github.com/tjorim/champagnefestival/issues/992) — the issue
  this document decides
- [#936](https://github.com/tjorim/champagnefestival/issues/936) — superseded
  parent; PR #990 shipped the sitemap/robots/noindex/share-preview half
- [`932-multi-worker-state.md`](./932-multi-worker-state.md) — the
  `LISTEN`/`NOTIFY` bus this document's proactive invalidation waits for, and
  the in-memory-state discussion this cache is deliberately excluded from
- [#944](https://github.com/tjorim/champagnefestival/issues/944) /
  `backend/app/services/policy_markdown.py` — the single Markdown
  renderer/sanitizer the `/privacy` render reuses
- `frontend/src/components/JsonLd.tsx` — the client JSON-LD builder the
  backend must not silently diverge from
- `frontend/index.html` — the shell, and its existing `%VITE_*%` placeholder
  idiom this document extends
- `docs/floor-plan-coordinates.md` — precedent for a written cross-language
  contract backed by tests on both sides
