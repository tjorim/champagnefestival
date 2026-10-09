# Frontend UI and themes

The frontend uses Tailwind v4, owned Base UI primitives in
`frontend/src/components/ui/`, and Lucide SVG icons. Bootstrap and react-select
are no longer dependencies. This guide consolidates the completed theme,
dialog, public-widget, icon and Bootstrap-removal work (#1105, #1107, #1108,
#1110 and #1111); migration inventories remain in Git history.

## Cascade layers

`frontend/src/styles/tailwind.css` declares layers in increasing precedence:
`theme`, `base`, `vendor`, `components`, `utilities`.

- `theme` contains Tailwind theme variables.
- `base` contains preflight, the fixed `--base-*` palette, semantic `--surface-*`
  tokens and document defaults. The defaults restore the heading, paragraph,
  list, link and policy-markdown styling the app needs above preflight.
- `vendor` contains Leaflet CSS.
- `components` contains owned stylesheets, `data-slot` rules and runtime themes.
- `utilities` contains unprefixed Tailwind utilities, without `!important`.

Utilities override normal component and theme rules. Unlayered CSS overrides
all layers, so new stylesheets must declare a layer. Layer order takes precedence
over selector specificity; broad resets in an owned theme can override vendor
rules even if those rules use classes. Keep resets in preflight/base rather than
adding universal theme selectors. Within `components`, bundled sheets precede
the appended theme link and specificity decides ties.

Use semantic colours from `tailwind.css`. The four shadcn Oxlint rules enforce
known classes, semantic colours and the absence of arbitrary values/inline styles.
Owned class namespaces are explicitly allowed in `.oxlintrc.json`; there is no
generated allow-list or frozen exception baseline. Dynamic geometry, image
ratios and validated saved colours use narrow, explained lint exceptions.
`safeRoomColor()` validates saved hex colours and provides a neutral fallback.

Generate primitives only as needed with `pnpm dlx shadcn@latest add <component>`
from `frontend/`, using the checked-in `components.json` (`base-vega`, Lucide,
Tailwind v4). Own and restyle the source; do not reinitialise the theme.
Use `@/lib/utils` for `cn`. See [AGENTS.md](../AGENTS.md#styling) for contributor
commands and styling conventions.

## Runtime themes and portals

`frontend/src/config/visualThemes.json` owns theme metadata. Vite injects it into
synchronous pre-paint code and React imports the typed registry. Storage failure
falls back to Refresh; pre-paint code also sets browser chrome colours.
`data-visual-theme` selects the public stylesheet. Refresh, Classic, Riviera and
Cuvée map theme variables through semantic surface tokens; Remuage maps its
`--rem-*` palette to those tokens directly. Millésime (an editorial paper-and-ink
theme with a numbered two-column section layout from 992px) maps its `--mil-*`
palette to the same shared tokens and uses only system fonts.

`data-theme-mode` drives the dark variant: Refresh and Millésime follow the
system (Millésime's dark "ink" variant is keyed on `html[data-theme-mode="dark"]`),
Classic is dark, and Riviera, Cuvée and Remuage are light. The admin scope uses
`data-theme-scope="admin"` and `data-theme-mode="dark"` with its own fixed
semantic palette; entering admin does not change the public document mode.

Wrap admin portal content, including popovers and backdrops, in
`AdminThemeScope`. A class on the trigger does not scope a portal. Public portals
inherit the visitor theme. Popup surfaces use semantic popover tokens rather
than page-background tokens, and dialog/popup layer tokens place them above
navigation. Dialog viewports scroll tall forms while Base UI locks document
scrolling; Combobox menus sit outside the scrolling viewport.

## Forms, dialogs and selection

Form state, validation, mutations and save callbacks stay with domain callers.
`AdminFields` associates labels, descriptions and errors; `PublicFields` adds
`data-public-form` hooks and public select portals follow the visitor theme.
UI primitives do not change write ownership or [retry safety](retry-safety.md).

Base UI owns focus trapping, initial focus, return focus, Escape and outside
interaction. Controlled roots route dismissal through the caller's hide
callback and can cancel closing through Base UI change-event details.

`ConfirmModal` exposes an `alertdialog` with a title and description. While
confirmation is pending, dismissal controls and Escape are blocked. Errors keep
it open; success closes it; closing clears old errors. Backdrop dismissal is
allowed while idle. Warning, primary and danger confirmations use warning,
default and destructive Button variants respectively, including focus and
pending states.

Person pickers retain debounced server search, selected values, clear controls
and loading feedback. Disable client filtering of server-filtered results.
Edition organisation pickers support grouped active/archived entries, selected
archived values, local search, multiple selection and removable chips. Compare
options by stable IDs across query refreshes. Picker inputs need translated
accessible labels even when the menu is portalled.

Event forms reset on opening or changing event/edition IDs, rather than whenever
an object or date-array identity changes. Reopening discards abandoned edits;
standalone event dates retain their edition-date synchronisation. Settings
refresh pristine forms while preserving dirty contact drafts during unrelated
maintenance refreshes. A successful save establishes a pristine baseline only
if no newer edits arrived while that save was pending.

## Public interactions and accessibility

- `FestivalFacts` sits below every hero variant with the dates, the venue and the
  registration action. Before registrations open it states the opening date
  rather than showing a disabled button, and the registration section is hidden
  when nothing is or will become registrable. It and the venue details above the
  map use semantic colours only; themes may refine them through
  `data-slot="festival-facts"`, `"venue-details"` and `"registration-opens"`.
  The footer repeats the navigation.
- `BrandWordmark` renders the festival name after the printed logo: "CHAMPAGNE"
  over a red script "festival", stacked so the full name fits narrow headers.
  The letterforms are fixed; themes only set `--wordmark-champagne` and
  `--wordmark-festival` ("festival" stays red, tuned for contrast per theme).
- `FestivalMascot` is the painted hostess from the association's artwork, cut
  out to a transparent WebP (`public/images/mascot-360.webp`, `mascot-720.webp`)
  so she sits on every theme. She is decorative (empty alt) and stands beside
  the countdown in Next Festival. A container query stacks her above it in
  narrow columns, where the half-length crop (`mascot-half-*.webp`, fading out
  below the table) keeps the section short; lazy loading means only the crop
  the layout shows is downloaded. Sources and the script that builds these files live in
  [`docs/brand/`](brand/README.md). The maintenance page uses `BrandWordmark` instead of the old
  placeholder logo.
- Header and HeaderClassic share `MobileMenu`, a Base UI Dialog sheet that slides
  in from the right below the large breakpoint and holds the section links and
  the staff-only admin entry. The language switcher stays in the header.
- Navigation comes from `useNavigationItems`, which drops links to sections that
  are not rendered: Other events is omitted while there are no upcoming bourses
  or capsule exchanges (`useOtherEventItems`).
- Web Push opt-in sits inside the contact section (`#notifications`). Its button
  stays enabled; pressing it without consent shows an inline error and focuses
  the checkbox, and never reaches the browser permission prompt.
- Public LanguageSwitcher menus use `admin={false}`. Admin consumers keep the
  fixed-dark portal scope.
- Schedule and MyAccountPage use Base UI Tabs with arrow-key activation and
  associated panels. Account panels remain mounted to preserve form state;
  inactive panels are hidden and inert.
- FAQ uses a single-open Accordion. CheckInPage's controlled Collapsible keeps
  its search panel mounted to retain entered search state.
- Tooltips supplement an accessible description; ContentManagement exposes
  edition usage with the trigger's `aria-description` as well as a sighted hint.
- RegistrationList Progress retains its accessible label. LayoutEditor room
  selection and PolicyManagement locales use labelled button groups with
  `aria-pressed`, because they switch one editor rather than independent panels.

Actions use buttons; navigation uses real links through `ButtonLink`. Alerts
use `role="alert"` by default and `role="status"` for polite feedback. Spinners
beside visible text are decorative; standalone loading indicators need a label.
Badges convey meaning through text or an accessible label as well as colour.
Cards expose stable artwork slots; interactive list rows contain native buttons.
The public breakpoints remain 576/768/992/1200/1400px.

`Icon` supplies decorative SVG attributes, inherited colour and an `em` size.
Icon-only controls require accessible labels. Lucide provides outline icons;
Facebook links use `ExternalLinkIcon` with Facebook text rather than a brand
icon. Persisted floor-plan `bi-*` values remain API identifiers:
[AreaIcon](../frontend/src/components/AreaIcon.tsx) maps them to Lucide and uses
`StoreIcon` for unknown values.

## Specialised renderers and verification

Floor plans, scanners, QR output, Leaflet, charts and theme artwork keep
their specialised renderers. Public `/` and `/privacy` shell injection is
covered by the [public rendering contract](decisions/992-live-public-render.md);
crawler fragments use their own inline layout rather than framework classes.
Admin table behaviour belongs to the [shared table contract](admin-data-table.md).

Component tests cover dialog dismissal/focus, dirty drafts, pending/error state,
confirmation variants, keyboard selection and archived/multiple selections.
Browser tests cover public registration focus/scroll behaviour, mobile bounds,
runtime themes and cascade layers. Keep those checks when changing the relevant
primitive or theme; historical migration checklists are not a second test suite.
