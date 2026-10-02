# Owned alerts, spinners and badges

Issue: [#1122](https://github.com/tjorim/champagnefestival/issues/1122).
Local implementation: 2026-10-01. Bootstrap removal remains owned by #1111.

## Implementation

All 48 `src` files that imported `react-bootstrap/Alert`, `/Spinner` or `/Badge`
now use owned primitives in `src/components/ui/`; **`react-bootstrap` has no
remaining importers in `src`**. The `react-bootstrap` and `bootstrap` dependencies,
the vendor stylesheet and the reboot stay until #1111 removes them. Business
logic, translations, API ownership and write behavior are untouched, so
`docs/retry-safety.md` needs no new entry.

| Primitive | Replaces | Contract |
| --- | --- | --- |
| `Alert`, `AlertHeading`, `AlertLink` (`alert.tsx`) | `Alert`, `Alert.Heading`, `.alert-link` | Plain `div` with `data-slot="alert"` and a `data-variant` tone. Default `role="alert"` (the Bootstrap default, which e2e specs rely on); pass `role="status"` for polite messages. Passing `onClose` renders a ghost icon `Button` named `m.close()`; `dismissible` is gone. |
| `Badge`, `toBadgeVariant` (`badge.tsx`) | `Badge`, raw `.badge.bg-*` spans | `data-slot="badge"` plus `data-variant` (`primary`, `secondary`, `success`, `danger`, `warning`, `info`, `dark`, `outline`). `bg=` became `variant=`; `text="dark"` is dropped because `warning`/`info` always use a contrasting foreground. |
| `Spinner` (`spinner.tsx`) | `Spinner`, raw `.spinner-border` spans | Border ring (`size="sm"`, token `variant`). Decorative (`aria-hidden`) unless it has a `label` (`role="status"` + `sr-only` text), a `role` or children. `prefers-reduced-motion` slows the rotation to 1.5 s through a `--animate-spinner-slow` theme animation instead of stopping it. |

Dismiss label: Bootstrap's untranslated `Close alert` became `m.close()` in all
three languages. Three tests changed accordingly (`MyAccountPage`, and the
`close` message added to the `AdminLoginForm` mock).

### Accessibility decisions

- **Live regions**: alert roles are unchanged one-to-one (default `alert`, explicit
  `status` where it already existed). The primitive never adds `aria-live`; call
  sites that already pair `role="alert"` with `aria-live="assertive"` were left as is.
- **Loading text**: 16 stand-alone spinners that had no accessible name now carry a
  `label` (`m.loading()` / `m.admin_loading()` / `m.admin_loading_events()`),
  including the root suspense fallback in `main.tsx`. Spinners next to visible text
  or inside a busy control are `aria-hidden` by default, so nothing is announced
  twice. The 18 existing `role="status"` + `sr-only` spinners keep working as written.
- **Root error fallback**: `AppSuspense`'s error fallback in `main.tsx` was a bare
  `div`; it is now a danger `Alert`, so a failed lazy section is announced.
- **Meaning beyond color**: every badge has visible text or an `sr-only` label
  (check-in, payment, status, availability: "Not checked in", "Unpaid", "Sold out",
  "Waitlist joined", ...). The one icon-only badge (strap issued) keeps its
  `sr-only` text. The archived-count badge that used a `dark`/`text-secondary`
  border treatment is the new `outline` variant.

### Raw markup

Nine raw class usages became components: four `spinner-border` spans in
`RegistrationList`, one in `ContentManagement`, the `alert-link` and two
`badge` spans in `RegistrationModal`, and the `badge` in `WaitlistManagement`.
The `bg-warning bg-opacity-*`/`bg-danger bg-opacity-*` tints in `LayoutEditor` and
`VenuePlanPage` are Bootstrap *background utilities* on layout cells, not
alerts/badges; they stay with #1123.

## Theme handling

Important utilities (layer `utilities`) outrank unlayered theme rules, so, as for
buttons (#1121), anything a theme must change is **not** a utility. Alert and
badge colors, radius, weight and size live in `src/styles/tailwind.css` keyed on
`data-slot`/`data-variant`; the component only carries layout utilities. Tones mix
the semantic color into `--surface-background` (`color-mix`), so one rule is correct
on light, dark and the fixed-dark admin scope without `data-bs-theme`.

Selector migration (13 `.badge*`/`.spinner-border*` selectors in 6 files, none for
alerts):

- Refresh, Riviera, Remuage: `.badge` → `[data-slot="badge"]` (pill, secondary fill and
  6px radius respectively); Remuage's warning amber → `[data-variant="warning"]`.
- Cuvée: tinted-outline stamps retargeted from `.badge.bg-success/-danger/-secondary/-info`
  to `[data-variant]`; `outline` shares the secondary stamp.
- Admin and the portalled admin dialog scope: the "warning is brand blue" badge became a
  `[data-variant="warning"]` rule without `!important` or the obsolete `--bs-badge-color`
  and `--layout-contrast` overrides. Remuage's admin amber override is retargeted too.
- The admin `.spinner-border.tw\:text-highlight` rule matched nothing since the spinners
  moved to the `variant` prop and is deleted; spinner `warning` now follows
  `--surface-warning`, which admin and Remuage already retint.

Known deltas: warning/info badges that previously had white text now use the dark
foreground (Bootstrap's own pairing for `text-dark`); a badge `title`/`aria-label`
on a `span` (ContentManagement type badge) is unchanged; alert padding is 12px/16px
(Bootstrap used 16px) and the dismiss button is a 24px ghost icon button.

## Final source and CSS audit

- `react-bootstrap/(Alert|Badge|Spinner)` importers: **48 → 0**
  (`rg 'react-bootstrap' frontend/src` has no matches). Component usages:
  Alert elements 141 → 142 (plus the root error fallback), Badge 79 → 82 and Spinner
  63 → 68 (the additions are the raw-markup conversions above).
- Raw `alert*`/`badge*`/`spinner-*` class tokens in TSX: **9 → 0** (matches for
  `role="alert"` and `data-slot="alert-dialog*"` are unrelated).
- Owned CSS selector references to `.alert*`, `.badge*` and `.spinner-*`: **15 lines → 0**.
- Generated allow-list: **2,268 → 2,267** entries; the `alert`/`spinner`/`badge` class
  family stays at **17** because it is vendor Bootstrap CSS generated until #1111
  (regenerated with `pnpm lint`, never edited).
- Frozen exception entries: **15 → 15**; none concerned these controls and none was added.

## Verification and evidence

New: `tests/components/StatusPrimitives.test.tsx` (default and overridden alert roles,
labelled dismiss button, heading/link with axe, badge hooks and `toBadgeVariant`,
decorative vs labelled spinner, reduced-motion class) and
`e2e/status-components.authenticated.spec.ts` (all five themes × light/dark × 1440/390 px:
public check-in and admin registration badges have text, no `.alert/.badge/.spinner-border`
remains, no horizontal overflow; screenshots are attached to each test).
Updated: spinner/badge selectors in the Members, People, Volunteers and Schedule tests and
the Remuage e2e alert selector.

Final checks: `pnpm format:check`, `pnpm lint` (existing warnings only), `pnpm typecheck`,
app and service-worker builds, **787 of 787** unit tests and all **207** Playwright checks
(187 existing + 20 new) pass. Desktop and mobile light/dark screenshots for every theme are
in the Playwright report artifacts; publishing them on the PR is left for review.

Keep #1122 active pending review. #1109 and #1111 status below remain in force; this
issue alone does not authorize final Bootstrap removal.
