# Unified self-service page for visitors, members, and volunteers

**Status:** Implemented (2026-09-12).
**Date:** 2026-09-12
**Related:** PR [#1037](https://github.com/tjorim/champagnefestival/pull/1037) (built on top of
the #1006 volunteer identity work — see
[`1006-volunteer-identity-self-service.md`](./1006-volunteer-identity-self-service.md));
[#953](https://github.com/tjorim/champagnefestival/issues/953) (visitor passwordless session);
[#922](https://github.com/tjorim/champagnefestival/issues/922) (owned-registrations reads)

---

## Context

By the time #1006 landed, the app had accumulated three separate direct-link-only
self-service pages, each re-implementing the same "sign the visitor in, then show
something" boilerplate:

- `/me` — OIDC-only, forced a Keycloak redirect on load; offered account deletion
  and (from #1006) the volunteer NISS/eID section.
- `/my-eid` — OIDC-only, same forced-redirect pattern, just for the volunteer
  section (folded into `/me` earlier in #1006's own PR once this was noticed).
- `/my-registrations` — the actual "view my bookings" page, but with a
  fundamentally different auth model: no forced sign-in at all, reachable
  anonymously via an emailed magic-link token or an existing visitor session
  (#953), with an OIDC-authenticated path bolted on only for the token-claim
  case.

A volunteer who signs up, books a ticket, and wants to check both would have to
juggle two different pages with two different sign-in stories.

## Decision — one page, three tabs, no forced sign-in

**`/me` is now the single self-service page for visitors, members, and
volunteers alike.** It never forces an OIDC redirect (unlike the admin
dashboard, which keeps its own gated `/admin` route as the one deliberate
exception). Content is organized into tabs, added only when they apply:

1. **Registrations** — always present. This is `/my-registrations`' existing
   content (email-lookup form, magic-link/session handling, booking cards,
   change-request modal, communication-language preference), now also gaining
   a **direct OIDC path**: a signed-in member/volunteer with no token in the
   URL fetches `GET /api/me/registrations` immediately, since
   `Registration.user_id` is already set at booking time for anyone who was
   signed in when they booked (#922) — no claim step needed, unlike the
   token-driven claim flow. The landing form also gained a "sign in instead"
   link for members/volunteers who'd rather authenticate than wait for an
   email.
2. **Volunteer eID** — OIDC + the `volunteer` realm role (#1006), unchanged.
3. **Account** — OIDC only, since `DELETE /api/me` requires an OIDC subject
   and a visitor session has no portal account to delete.

When only one tab applies — the common case for an anonymous visitor — it
renders directly with no tab chrome, so the experience is identical to the
old `/my-registrations` page.

**`/my-registrations` is removed outright, not kept as an alias.** No
confirmation or magic-link email had gone out referencing it yet, so there
was no compatibility burden — `send_visitor_magic_link_email` and the
post-booking "view my registrations" link (`RegistrationModal`) now point
straight at `/me?token=...`. The `MyRegistrationsPage` component (still that
name — it's the Registrations tab's content, not a route anymore) reads its
`token` search param via `useSearch({ from: "/me" })`.

### Auth-error handling changed to match

`/me` no longer blocks the whole page behind an `authError` gate (that only
made sense when the page's sole job was forcing a sign-in). An `authError` —
e.g. a failed silent token renewal — now shows as a dismissible inline
`Alert`, and the rest of the page (registrations, in particular) keeps
working underneath it, since anonymous browsing was never gated on OIDC in
the first place.

### Buttons that only make sense for one audience

The registrations section's "sign out" (visitor session) and "request
another secure link" controls are now both explicitly hidden for an
OIDC-authenticated viewer — previously "request another secure link" could
show even to a signed-in member who claimed via a token, which stopped
making sense once a plain OIDC session (no token at all) became a normal way
to land on this tab.

## What this does not do

- No change to the retry-safety or idempotency of any existing write —
  this is a frontend composition and auth-resolution change only. The
  underlying endpoints (`GET/POST /api/me/registrations*`,
  `POST /api/me/volunteer/*`, `DELETE /api/me`) are untouched.
- No MCP/Android/Pebble equivalent — same as every `/api/me/*` and
  `/my-registrations`-era surface before it; these remain browser-session-only.
- No site navigation entry — `/me` stays direct-link-only, same as before.

## References

- [Volunteer identity self-service](./1006-volunteer-identity-self-service.md)
- [Visitor passwordless session](./953-visitor-passwordless-session.md)
