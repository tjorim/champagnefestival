# Volunteer form validation and acceptance (#1423)

## Behaviour

Identity registration explains why the existing identity fields are requested,
where to find them, their format, and how to ask the organisers for help.
Checksum validation focuses the invalid field and associates the translated
correction with that field. API errors use stable codes and translated fallbacks;
raw diagnostics are never interface text. A linked volunteer with missing optional
identity details can still answer questions without adding those details.

Each question groups its title, description, deadline/closed state, input, save
mode and local feedback. Instant answers save on change; text and dietary notes
use their Save button. One poll write runs at a time because responses replace
the whole poll. A pending message explains the temporary pause of other controls.
Failures retain drafts; instant controls offer an explicit retry of the failed
replacement, while text/note Save submits the current draft. No automatic retry
was added. See [retry safety](../retry-safety.md).

## Browser acceptance — 2026-10-28

The repeatable authenticated Chromium suite is
`frontend/e2e/volunteer-forms.authenticated.spec.ts`. It uses synthetic identities
and questions with MSW; no real identity numbers or production writes are used.

The matrix covers 1280×800, 1366×768 and 1440×900, plus 1280×600 reduced usable
height, in Dutch, French and English. Each language is asserted against its actual
translated guidance. It exercises invalid registration with field focus and ARIA
associations, linked optional-details state, long text answers, delayed failed
saves, draft preservation, save-button reachability, horizontal overflow and
nested scrolling. Axe scans the active volunteer panel for WCAG A/AA violations.
Screenshots are generated for identity validation and failed poll saves.

Separate cases use Chromium's `chrome.tabs.setZoom` at 125% and 150% on a
1366×600 window with French text. Device pixel ratio verifies actual browser zoom;
visual viewport scale remains 1, ruling out pinch emulation. Identity and poll
controls remain reachable by ordinary document scrolling. The checks do not use
CSS zoom or merely shrink the viewport as a substitute for browser zoom.

The browser checks found and fixed two problems: long text answers previously
scrolled inside a fixed-height textarea, and gold outline identity buttons failed
contrast on the secondary panel. Shared scalar-answer fields and dietary notes
now size to content; identity submit controls use the shared neutral outline
variant. Closed questions no longer show an instruction to save changes.

Everyday-task navigation remains in #1421. These are local Chromium acceptance
checks, not a production deployment or a user study.

## Results and acceptance

All 14 browser cases pass: 12 viewport/language combinations plus two real zoom
cases. The first full run passed 13 cases; the reduced-height English case hit a
fixture race with the home-page locale redirect. Seeding now starts on the stable
`/check-in` route; the failed case passes on its targeted rerun. Authentication
setup also passes. This setup correction changes no application behaviour.

- [x] Labels, guidance and validation remain associated at the laptop sizes.
- [x] Failed long answers retain the full draft and the Save control is reachable.
- [x] Ordinary document scrolling reaches controls without nested scrolling.
- [x] Dutch, French and English guidance is rendered and checked explicitly.
- [x] Real 125% and 150% browser zoom preserves identity/poll control reachability.
- [x] Active volunteer panels pass the scoped WCAG A/AA axe checks.

Follow-up validation also passes frontend typecheck, lint (existing warnings),
production build, formatting and UI inventory/import checks; 27 identity/poll
component tests and the shared order-question editor regression pass. The initial
implementation's backend identity suite passed 16 tests with one PostgreSQL-only
skip, including stable invalid-identity codes.
