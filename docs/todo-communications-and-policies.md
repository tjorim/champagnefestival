# TODO: public communications and policy administration

This document is the issue-ready roadmap for adding a small set of operational
communications tools to the admin dashboard. It is deliberately **not** a plan
for a general-purpose CMS.

## Product boundary

Administrators should be able to manage content that changes during normal
festival operations. Application structure, branding, credentials, and
infrastructure remain code- or deployment-managed.

### In scope

- Public contact details.
- Short, scheduled, localised public announcements.
- Versioned legal policies written in a restricted Markdown subset.
- Individual email-client actions for members and registrations.
- Opt-in Web Push notifications after a subscription/consent foundation exists.
- A central composer for the supported announcement and push channels.

### Out of scope

- Arbitrary pages, layouts, blocks, HTML, or CSS.
- Navigation, themes, logos, and hero composition.
- SMTP or VAPID credentials in the database.
- Uploaded recipient lists or arbitrary database audience queries.
- Bulk marketing email until consent, unsubscribe, suppression, bounce, and
  delivery requirements have a separate approved design.

## Delivery order

1. Public contact settings.
2. Scheduled announcement banner.
3. Individual `mailto:` actions.
4. Versioned policy publishing.
5. Web Push subscription and consent foundation.
6. Central multi-channel notification composer.

The first three items form a useful initial milestone without introducing a
server-side campaign delivery system.

---

## TODO 1: manage public contact details

**Suggested issue title:** `Admin: manage public contact email, telephone, and social link`

### Goal

Move only the public-facing contact values into the existing application
settings:

- `public_email`
- `public_phone`
- `facebook_url`

SMTP credentials, sender identity, and the internal contact-form recipient stay
in deployment configuration.

### Acceptance criteria

- [ ] `GET /api/settings` exposes the public values without exposing secrets.
- [ ] `PUT /api/settings` remains admin-only and validates email, phone, and
      HTTPS social URLs.
- [ ] The Settings dashboard provides a small form with translated labels.
- [ ] Contact, maintenance, and policy pages consume the settings.
- [ ] Empty optional values hide the corresponding public action cleanly.
- [ ] Compiled defaults cover the rollout/API-error path.
- [ ] Changes create audit entries.
- [ ] Backend, frontend, and public rendering tests are included.
- [ ] The non-retry-safe `PUT` decision is documented; the client does not retry
      automatically.

---

## TODO 2: scheduled localised announcement banner

**Suggested issue title:** `Public: add scheduled localised announcement banner with accessible ticker presentation`

### Goal

Publish short operational messages such as sold-out notices, entrance changes,
or timing updates. The data model is an announcement, not a generic content
block.

### Proposed fields

- Stable ID.
- Dutch, English, and French short text.
- `info`, `warning`, or `urgent` level.
- Active flag and deterministic display order.
- Optional `starts_at` and `ends_at` timestamps.
- Optional safe link and translated link label.
- Created, updated, and published metadata.

### Acceptance criteria

- [ ] Admins can create, preview, schedule, disable, reorder, and expire
      announcements.
- [ ] Locale completeness is visible; missing text never silently falls back to
      another language.
- [ ] Publication windows are evaluated server-side in UTC.
- [ ] The public API returns only currently visible announcements.
- [ ] The default presentation is a static, accessible banner.
- [ ] Any optional marquee motion pauses on hover/focus, has a pause control,
      and is disabled by `prefers-reduced-motion`.
- [ ] Ordinary notices do not repeatedly announce through a live region; urgent
      notices use one only when appropriate.
- [ ] Create, update, publish, unpublish, reorder, and delete are audited.
- [ ] Write retry-safety decisions and scheduling tests are included.

---

## TODO 3: individual email-client actions

**Suggested issue title:** `Admin: add compose-email actions for members and registrations`

### Goal

Open an administrator's configured email client with a prepared individual
message. The application must not claim that it sent the message.

### Scope

- Member/person row action when an email address exists.
- Registration-detail action with templates for:
  - a general registration message;
  - event information;
  - an order summary;
  - an outstanding-payment reminder.
- Optional order context limited to the selected registration: event,
  registration reference, product names/quantities, amount due, and payment
  status.

Internal notes, check-in/access tokens, audit history, and unrelated
registrations must never be included.

### Acceptance criteria

- [ ] The UI says **Open in email client**, never **Send**.
- [ ] Admins preview the recipient, subject, and body before opening `mailto:`.
- [ ] Recipient, subject, and body are correctly encoded.
- [ ] Long messages offer copy-to-clipboard instead of relying on an oversized
      `mailto:` URL.
- [ ] The order template uses only the selected registration.
- [ ] No backend write or false “sent” audit record is created.
- [ ] Bulk recipients and uploaded address lists are out of scope.
- [ ] Accessibility and sensitive-field exclusion are tested.

---

## TODO 4: versioned Markdown policy publishing

**Suggested issue title:** `Legal: add versioned Markdown policy editor with draft and publish workflow`

### Goal

Manage policies through immutable published versions and derive “last updated”
from publication time.

Use a Markdown source editor with a rendered preview rather than storing WYSIWYG
HTML. A small formatting toolbar may assist authors, but the Markdown source
remains visible and portable.

### Proposed model

- Stable policy key, initially `privacy`.
- Translated policy title.
- Version ID/sequence and optional internal change summary.
- Per-locale Markdown source.
- `draft`, `published`, or `superseded` status.
- Created, updated, and `published_at` timestamps.
- Creating and publishing actor.

### Publication rules

- Drafts are editable; published versions are immutable.
- Publishing atomically supersedes the previous current version.
- Historical versions cannot be deleted and remain inspectable.
- “Last updated” is `published_at`, never manually entered.
- Rollback republishes old content as a new version so history is preserved.
- Concurrent publication is protected by a precondition or database lock.

### Markdown safety

- [ ] Support an explicit Markdown subset only.
- [ ] Disallow raw HTML and unsafe URL schemes.
- [ ] Sanitize rendered HTML with an allowlist.
- [ ] Apply safe link attributes.
- [ ] Use exactly the same renderer/sanitizer for preview and public output.

### Acceptance criteria

- [ ] Admins can create a draft from the current version and preview every
      locale.
- [ ] Locale publication requirements are explicit and enforced.
- [ ] Publish is atomic, audited, and concurrency-tested.
- [ ] The public page serves only the latest published version.
- [ ] Historical versions and publishing actors are visible to admins.
- [ ] The compiled privacy policy is migrated into an initial published version.
- [ ] Sanitisation tests cover scripts, raw HTML, unsafe links, and malformed
      Markdown.
- [ ] Publish retry-safety is implemented and documented before automatic retry.

---

## TODO 5: Web Push/VAPID subscription foundation

**Suggested issue title:** `Notifications: establish Web Push/VAPID subscriptions and consent lifecycle`

### Goal

Build the secure opt-in and delivery foundation before adding an administrator
broadcast button. There is currently no production notification service worker
or VAPID subscription lifecycle in this repository.

### Decisions to record first

- Anonymous, authenticated, or both kinds of subscribers.
- Account- versus device-scoped subscriptions.
- Notification categories and default preferences.
- Event-specific subscription support.
- Retention and expired-subscription cleanup.
- Browser/iOS support expectations.
- Future Android integration boundary.
- Consent and privacy-policy wording.

### Acceptance criteria

- [ ] A production service worker coexists safely with application updates.
- [ ] The VAPID public key is available to clients; the private key remains an
      environment secret.
- [ ] Users explicitly opt in and can unsubscribe.
- [ ] Subscription locale, category preferences, and lifecycle are persisted.
- [ ] Mutation endpoints are authenticated/rate-limited as designed.
- [ ] `404`/`410` delivery responses retire invalid subscriptions.
- [ ] Payload size and target URLs are validated.
- [ ] A restricted admin test notification works and is audited.
- [ ] Consent, retention, privacy, and retry/idempotency decisions are tested and
      documented.
- [ ] No general broadcast composer is included in this issue.

---

## TODO 6: central announcement and push composer

**Suggested issue title:** `Notifications: add central composer for in-app announcements and Web Push`

**Blocked by:** TODO 2 and TODO 5.

### Goal

Compose one operational message centrally and deliver it through explicitly
selected supported channels:

- public in-app announcement;
- Web Push.

Server-sent bulk email remains out of scope pending a separate compliance and
deliverability design.

### Proposed message fields

- Translated short title/body.
- Selected channels.
- Severity/category.
- Optional validated internal URL.
- Explicit supported audience.
- Draft/scheduled/published/sent state.
- Immutable send snapshot.
- Delivery counts and failure summary.

Initial audiences should be limited to all opted-in subscribers and, if the
subscription model supports it, subscribers to a specific event. Do not allow
arbitrary queries or uploaded lists.

### Acceptance criteria

- [ ] Every locale/channel has an accurate preview.
- [ ] The estimated audience is shown before explicit confirmation.
- [ ] Scheduled sends use server time and an idempotent worker contract.
- [ ] Duplicate worker execution cannot send twice.
- [ ] The immutable message snapshot and admin actor are audited.
- [ ] Failure in one channel does not roll back a successful other channel.
- [ ] Per-channel results are visible without exposing subscription secrets.
- [ ] Authorisation and rate limits are enforced.
- [ ] Email does not appear as a channel until consent, unsubscribe,
      suppression, bounce, and delivery handling have an approved design.

## Dependency map

```text
Public contact settings
Announcement banner ───────────────┐
Individual mailto actions          │
Versioned policy publishing        ├─> Central notification composer
Web Push/VAPID foundation ─────────┘
```

## GitHub issue creation

These sections are intentionally formatted as issue-ready titles and bodies.
When GitHub credentials are available, create one tracking issue plus one issue
per TODO, link the dependencies above, and then replace this section with the
resulting issue links. Until then, this document is the source of truth for this
roadmap.
