# Custom views and remaining legacy CSS exceptions

Issue: [#1123](https://github.com/tjorim/champagnefestival/issues/1123).
Local implementation: 2026-10-02. Bootstrap removal remains owned by #1111.

## Implementation

The frozen exception baseline `frontend/.oxlint-legacy-exceptions.json` is now empty
(**15 entries → 0**: 46 `no-inline-styles` property allowances and 30 `no-unknown-classes`
hooks). `react-bootstrap` has no importers in `src`, `tests` or `e2e`. Business logic,
translations, API ownership and write behavior are unchanged, so `docs/retry-safety.md`
needs no new entry.

### Replace-or-keep decisions

| Area | Decision |
| --- | --- |
| `MaintenancePage` | **Replaced.** The embedded `<style>` string and the blanket `no-inline-styles: off` exemption became `maintenancePage.css` plus classes; every inline style on the page moved into it. The flyer card/lightbox interaction, artwork, per-theme CTA/scrim/card treatments and the 900 px wide-viewport layout are unchanged. Text/image rules are scoped under `.maintenance-page` so they still outrank global theme element rules (`h1 {}`, `img {}`) that inline styles used to beat. |
| `AnnouncementBanner` | **Replaced.** The seam gradient was an inline `background` built from a duplicated `LEVEL_COLOR` map. Seams now carry `data-from`/`data-to`; colors are `--announcement-*-bg` custom properties shared by item fills and gradient endpoints. The unused `announcement-dialog-list`/`list-unstyled` hook became utilities. |
| `ThemeSwitcher` | **Replaced.** Inline styles plus `!important` mobile overrides became one fixed-color stylesheet (`ThemeSwitcher.css`) keyed on `aria-pressed`, still independent of the active theme. |
| `CheckInScanner` | **Replaced.** Aspect ratio, `object-fit`, `display` and `pointer-events` are `tw:` utilities (`aspect-4/3`, `object-cover`, `block`/`hidden`, `pointer-events-none`, `w-3/5`, `aspect-square`). The jsQR/video logic is untouched; the scanner stays a custom component. |
| `AdminSkeleton` | **Replaced.** Bar sizes are `tw:` size utilities (fractions such as `w-3/8` approximate the former 38 % etc.). |
| `ContactMessagesManagement`, `WaitlistManagement` | **Replaced.** `white-space: pre-wrap` is `tw:whitespace-pre-wrap`. |
| `ContactInfo`, `Schedule`, `RemuageFeatureRack`, `RivieraHero` | **Stale hooks removed**: `contact-info`, `schedule-container`, `remuage-feature__content` and `riviera-button--primary` had no CSS. |
| `ResponsiveImage` | **Kept custom**, with one narrow documented inline allowance: the aspect-ratio spacer height derives from each image's `width`/`height`. Static `objectFit`/`top`/`left`/full-size styles became utilities; the dead `object-cover` hook is now `tw:object-cover`. |
| `VenuePlanPage` | **Kept custom.** Per-layout geometry stays inline behind scoped `oxlint-disable` comments referencing `docs/floor-plan-coordinates.md`: the room `aspect-ratio` and saved room color, and area/table `left`/`top`/`transform`. Static pieces moved to utilities (`w-full`, `min-h-70`, `min-w-18`) and the faint row background to `[data-slot="venue-plan-canvas"]` in `tailwind.css`. |
| Floor plan (`LayoutEditor`, `VenueManagement`), jsQR scanner, QR output, Leaflet, Swiper, analytics, Remuage/Riviera artwork | **Kept custom**: domain rendering or vendor integration (see the issue). Their existing narrow inline allowances are unchanged. |
| Test placeholders | `custom-class` in the `ResponsiveImage`/`SectionHeading` tests became a real `tw:mt-2` class; the `fill` test now asserts classes instead of inline styles. |

### Saved room colors

Room colors are written to inline styles (floor-plan canvas border, editor swatch and
heading, venue swatch). The backend enforces a hex pattern on writes, but responses are
plain strings, so `safeRoomColor()` in `src/utils/layoutUtils.ts` re-checks the same
pattern before each use and falls back to the neutral `var(--surface-border)` (or
`inherit` for text). Anything else (named colors, `var()`/`url()` payloads, malformed
hex) is rendered with the fallback.

### Raw Bootstrap utilities in migrated views

A tokenised search of every string in `src`, `tests` and `e2e` against the vendor
stylesheet found raw Bootstrap utilities that survived the layout/control groups; all
are replaced with `tw:` semantic utilities: `border*`/`rounded*`
(`tw:rounded-md tw:border tw:border-border|subtle`), `bg-dark|light|white|body-tertiary|
warning|danger|success|info` + `bg-opacity-*` (`tw:bg-muted`, `tw:bg-warning/10`, …),
`fst-italic`, `opacity-75`, `shadow-sm`, `object-fit-contain`, `font-monospace`,
`align-baseline`, `ratio ratio-16x9` and the interpolated ``border-${variant} text-${variant}``
in `PeopleManagement`. `border-secondary` maps to `tw:border-subtle` (same
`--bs-secondary` fallback). Unoccupied floor-plan tables use `tw:text-foreground`
on `tw:bg-muted` so they stay legible on light public themes (the old `bg-dark` forced
dark). The QR background stays white on purpose.

## Selector audit

Owned CSS was checked for classes with no producer in `src`/`index.html`. Removed:

| File | Removed |
| --- | --- |
| `admin.css` | `#admin .nav-tabs*`, `.tab-pane` rules (tabs are Base UI now) and stale comments |
| `theme-classic.css` | `.bubble-container-placeholder`, `.gradient-text`, `.schedule-container .nav-tabs …` |
| `theme-cuvee.css` | `.bubble-background`, `.dropdown-menu-dark`, `.bg-dark`, `.border-secondary`, `.table-dark` |
| `theme-refresh.css` | `.bubble-container-placeholder`, `.text-brand`, `.gradient-text`, `.map-iframe*`, `.bg-dark`, `.border-secondary` |
| `theme-riviera.css` | `.bubble-background`, `.section-title`, `.bg-dark` |
| `remuage/admin.css`, `remuage/surfaces.css` | `.table-dark`, `.bg-dark`, `.border-secondary` |

In total 24 rules and 41 selector references were removed. Retained on purpose:
Leaflet/Swiper selectors (vendor classes generated at runtime), `lucide-*` selectors
(added by the icon library), dynamic `announcement-${level}` classes and `.table`
theme overrides (rendered by `ui/table.tsx`).

`scripts/generate-legacy-classes.mjs` previously read only `public/themes/*.css`, so
classes defined in the four `theme-remuage.css` partials were invisible and needed
hand-written exceptions. It now follows relative `@import`s and also reads
`maintenancePage.css`.

## Final source and CSS audit

| Measure | Before | After |
| --- | --- | --- |
| Frozen exception entries | 15 | **0** |
| Inline-style property allowances / unknown-class hooks in the baseline | 46 / 30 | **0 / 0** |
| `style={…}` props in `src/**/*.tsx` | 40 | **11** (all geometry, room colors or CSS custom properties) |
| `oxlint-disable shadcn/no-inline-styles` comments | 6 | 10 (four added for floor-plan/aspect-ratio data, each justified) |
| Generated allow-list entries (`pnpm lint`, never hand-edited) | 2,267 | 2,294 |
| Raw Bootstrap utility tokens in the audited families (border/rounded/bg/…) in TSX | 74 | **0** |
| `react-bootstrap` imports in `src`/`tests`/`e2e` | 0 | 0 |
| `<style>` elements rendered by components | 1 | 0 |

The allow-list grows because it now includes the 89 classes of the Remuage partials and
the 16 of `maintenancePage.css`, offset by the removed selectors; the Bootstrap vendor
families (`alert`, `badge`, `spinner`, `btn`, `card`, …) still generate until #1111.

## Verification and evidence

New: `tests/components/MaintenancePage.test.tsx` (no embedded style/inline styles),
`ThemeSwitcher` (no inline styles), `AnnouncementBanner` (typed seams), and the
`/api/venue-plan/:editionId` and `msw:maintenance`/`msw:announcements` MSW seeds.
Playwright: `e2e/custom-views.spec.ts` (all five themes × light/dark × 1440/390 px:
maintenance page + preview switcher, announcement seams) and
`e2e/custom-views.authenticated.spec.ts` (admin floor plan: owned background, preserved
x/y geometry, selected table). Screenshots are attached to each test.

Keep #1123 active pending review and screenshot publication. With #1117–#1123 implemented
locally, #1111 is unblocked only on its own cleanup gates; this issue alone does not
authorize final Bootstrap removal.
