# Owned buttons and button groups

Issue: [#1121](https://github.com/tjorim/champagnefestival/issues/1121).
Local implementation: 2026-10-01. Bootstrap removal remains owned by #1111.

## Implementation

All 43 scoped `react-bootstrap/Button` importers and the three `ButtonGroup`
importers now use the owned Base UI `Button` (`src/components/ui/button.tsx`) and
`ButtonGroup` (`src/components/ui/button-group.tsx`). Bootstrap reboot and the
runtime theme-link ordering are unchanged. Business logic, translations, API
ownership and write behavior are untouched; `type="submit"` vs the default
`type="button"`, `disabled`, `aria-busy` and icon-only `aria-label`s were carried
over one-to-one.

### Variants

The generated Button already had `default`, `warning`, `outline`, `secondary`,
`ghost`, `destructive` and `link`. Bootstrap variants map as follows; only the
variants the app actually used were added, all built from semantic tokens:

| Bootstrap | Owned |
| --- | --- |
| `primary` | `default` |
| `secondary`, `warning` | same name |
| `outline-secondary`, `outline-light` | `outline` |
| `danger`, `success`, `info` | new `danger`, `success`, `info` |
| `outline-primary/-danger/-warning/-success/-info` | new `outline-*` of the same tone |
| `dark` + `.bg-brand-gradient`, `.btn-champagne` | new `brand` |
| `.btn-outline-light` on hero links | new `light` |

Every Button now carries `data-variant` and `data-size`, which is the stable hook
themes use (below). Bootstrap's implicit `btn-group` sizing is replaced by an
explicit `size="sm"` on each grouped button.

### Link rendering

Actions stay `<button>`; navigation is a real `<a>` through the new `ButtonLink`
(`render` accepts a router `<Link>`). Link buttons are no longer exposed as
`role="button"`:

- announcement link (`AnnouncementBanner`), "open email client"
  (`EmailComposeModal`, was `<Button as="a">`), Google Calendar link
  (`MyRegistrationsPage`), venue-plan link (`CheckInPage`), "back to site"
  (`main.tsx`) and the classic/Refresh hero calls to action.
- Two tests that located these as buttons now query `link`.

### Button groups

`ButtonGroup` is a `role="group"` flex container with a required `aria-label`.
It does not join borders. The seven groups (registration list: edition, date,
status; content: type, edition type; policy: Markdown toolbar; layout editor:
layer) gained accessible names (new `admin_*_aria` messages in en/fr/nl) and the
filter/toggle buttons expose `aria-pressed`. `ToggleGroup` was not used: the
filters are existing click-to-filter buttons, not form selection, and keeping
buttons avoids changing roles and keyboard behavior that tests and e2e rely on.
The single-button "today" group became a one-button group with `aria-pressed`.

Icons inside buttons rely on the button's flex `gap`; the `me-*` margins on direct
icon/spinner children were removed (nested wrappers keep theirs).

### Raw `btn*` markup

| Location | Replacement |
| --- | --- |
| `main.tsx` classic/Refresh hero links, registration CTA, standalone back link | `ButtonLink` / `Button` with `brand`, `light`, `warning`, `outline` |
| `ContactForm` submit | `Button variant="brand"` |
| `MyRegistrationsPage` calendar, `CheckInPage` venue link | `ButtonLink` |
| `MaintenancePage` CTA | still a theme-free `<a>`; the page's own CSS now carries the geometry that `.btn .btn-lg` used to supply |
| Cuvée/Remuage/Riviera hero links | still plain anchors with their theme classes; each theme class now owns its display/padding/gap instead of relying on `.btn` |
| `LayoutEditor` `btn-group` | `ButtonGroup` |

## Theme handling

Important utilities (layer `utilities`) outrank unlayered theme rules, including
unlayered `!important`, so themes cannot recolor an owned button by property.
They retint it through tokens on the button and draw gradients/edges as
non-utility properties (`background-image`, inset `box-shadow`):

- `--color-warning` and `--color-warning-foreground` now read
  `--surface-warning`/`--surface-warning-foreground` (fallback unchanged), so a
  scope can retint warning buttons.
- Admin (`admin.css`, Remuage admin): the "warning is brand blue" treatment is now a
  single `[data-theme-scope="admin"] [data-slot="button"][data-variant="warning"]`
  rule (gradient image + tokens, hover brightness, focus glow). It covers admin
  dialogs because the portal wrapper carries the scope, so the two
  `dialog-content .btn-warning` blocks are gone.
- Classic: `brand` draws the primary→secondary gradient.
- Refresh: pill radius through `--radius-md`, champagne gradient `brand`, light
  outline `light` (hero variant keeps its cream colors).
- Cuvée: 2px radius, uppercase gold-gradient `default`/`warning`/`brand` with
  inset foil edge, green hover; ghost `light`; standalone navbar and admin sidebar
  footer outline/danger buttons retint via tokens.
- Riviera: the previously universal `.btn` treatment (yellow gradient, 2px edge via
  inset shadow, offset shadow, teal hover) now targets every non-admin owned button.
- Remuage: 9px radius, blue `brand`, `#registrations`/`.standalone-app` warning in
  blue with a deep-blue hover image; standalone navbar outline retinted.

Known deltas: Tailwind's `disabled:opacity-50` is important, so Refresh's old
`#registrations .btn:disabled { opacity: 1 }` is reduced to the matching colors; the
1px/2px *border colors* that Cuvée and Riviera drew with `border-color` are drawn with
an inset shadow because the base Button keeps a transparent border; focus rings
replace the old `.btn:focus-visible` outline.

## Final source and CSS audit

- `react-bootstrap/Button` imports: **43 → 0**; `ButtonGroup`: **3 → 0**;
  `react-bootstrap` importer files: **51 → 48** (the rest import Alert, Spinner
  and Badge, owned by #1122). Searches:
  `rg 'react-bootstrap/(Button|ButtonGroup)' frontend/src` (no matches) and
  `rg '\bbtn(-[a-z]+)*\b' frontend/src --glob '*.tsx'` (only the two comment
  mentions in `MaintenancePage.tsx`).
- Raw `btn*` class tokens in TSX: **37 → 0 live** (2 comment mentions).
- Owned CSS selector references to `.btn*` / `.bg-brand-gradient` in themes and
  admin CSS: **53 → 0**. Retained hooks: `.cuvee-button`, `.remuage-button`,
  `.riviera-button` (theme-owned hero links) and `.maintenance-page__cta`.
- Generated allow-list `btn*` entries: **290 → 280**; the remainder is vendor
  Bootstrap CSS, generated until #1111 (regenerated with `pnpm lint`, never edited).
- Frozen exception entries: **15 → 15**. No entry concerned buttons and none was
  added.

## Verification and evidence

New: `tests/components/Button.test.tsx` (type defaults, variant/size hooks, disabled
and icon-only behavior, `ButtonLink` link semantics and `render`, labelled
`ButtonGroup` with pressed state and axe). Updated: the announcement and email-preview
tests query the link role.

Final checks: `pnpm format:check`, `pnpm lint` (existing warnings only),
`pnpm typecheck`, the app and service-worker builds, **776 of 776** unit tests and
all **187 Playwright checks** (public/admin theme, viewport, cards, forms and
coexistence matrices) pass. Desktop samples of the Refresh, Classic, Riviera, Cuvée
and Remuage heroes, the registration CTA and the Classic/Cuvée/Remuage admin
registration list were reviewed locally; screenshot publication is left for the PR.
Theme overrides of the control radius must set `--tw-radius-md` (the prefixed Tailwind
variable); the pre-existing `--radius-md` in the Remuage public-form rule from #1120
therefore has no effect and is left for a follow-up.

No write operation, endpoint, payload or retry strategy changed, so
`docs/retry-safety.md` needs no new entry.

Keep #1121 active pending review. #1109 and #1111 status below remain in force; this
issue alone does not authorize final Bootstrap removal.
