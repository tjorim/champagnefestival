# Live backend rendering of `/` and `/privacy`

**Status:** Templating approach and cache strategy proposed, pending owner
confirmation before implementation starts. Decision 2's `#932` dependency
shipped 2026-09-07 (`docs/decisions/932-multi-worker-state.md`), so the
Postgres `LISTEN`/`NOTIFY` bus this document's proactive-invalidation step
needs already exists — that step is no longer blocked, only still
unimplemented pending this document's own confirmation.
**Date:** 2026-09-06
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

**Proposed: marker replacement into `index.html` as built by Vite, with
per-fragment autoescaping. No Jinja2.**

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

## Decision 2 — a short TTL is the correctness floor; proactive invalidation is an optimisation on top

**Proposed: a 60-second in-process TTL cache with a last-known-good fallback,
and no proactive invalidation until #932's `LISTEN`/`NOTIFY` bus exists.**

This is the question with a dependency the issue did not draw out. #992
suggests invalidating proactively on the relevant admin mutations. That works
today only because the app runs exactly one worker — which is the precise
limitation #932 exists to remove. Under two or more workers, an admin's FAQ
edit reaches whichever worker served the mutation; that worker clears *its*
cache, and every other worker keeps serving stale HTML with nothing to correct
it. Proactive invalidation would be a correctness regression the moment #932
ships, and a silent one.

The ordering that survives both states:

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
- **Proactive invalidation later, over `NOTIFY`.** Once #932's Postgres
  `LISTEN`/`NOTIFY` bus is in place, a publish on FAQ/edition/policy mutation
  reaches *every* worker, and the TTL becomes a backstop rather than the only
  mechanism. That is the point at which proactive invalidation is safe, and it
  arrives as a latency improvement on a design that was already correct.
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

**Proposed: the server-rendered JSON-LD is the one a crawler sees; the client
component stops emitting a duplicate when one is already present.**

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

**Proposed: server-rendered FAQ/schedule markup targets crawler-visible text
and a non-embarrassing no-JS page, and is allowed to be replaced wholesale
when React mounts.**

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

## What remains before implementation starts

1. Confirmation of Decision 1's no-new-dependency approach, or a preference
   for Jinja2-for-fragments instead.
2. Confirmation of the 60-second TTL, and of deferring proactive invalidation
   behind #932 rather than shipping it now against a single worker.
3. Agreement that the frontend `index.html` gains inert `<!--ssr:*-->` markers
   — a small change to a file the backend otherwise never touches.
4. A companion change in `tjorim/apps`: the exact-path `handle` for `/` and
   `/privacy`, **and** the read-only mount of the built frontend into the API
   container. Both land there, not in this repository.
5. Once confirmed: implement the two route handlers, the fragment builder and
   its escaping helper, the shared JSON-LD fixture and its two contract tests,
   the client-side duplicate-suppression in `JsonLd.tsx`, and update
   `docs/product-audit-2026-08.md`'s #992 row per `AGENTS.md`.

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
