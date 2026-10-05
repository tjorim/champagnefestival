# Bootstrap removal and the final Tailwind cascade

Issue: [#1111](https://github.com/tjorim/champagnefestival/issues/1111), the
final step of [#1103](https://github.com/tjorim/champagnefestival/issues/1103).
It completes the coexistence cleanup gates recorded in
[1104-tailwind-coexistence.md](1104-tailwind-coexistence.md).

## What was removed

- `bootstrap`, `react-bootstrap` and `bootstrap-icons` (package.json, lockfile,
  entry-point imports, the Dependabot group). `src/`, `tests/` and `e2e/` contain
  no Bootstrap class strings; Oxlint enforces it (see Lint below).
- `data-bs-theme`. Runtime themes already published light/dark through
  `data-theme-mode` (#1105); that attribute is now the only mechanism, written
  by the pre-paint script in `index.html` and by `useVisualTheme`. The
  `bootstrapMode` field of the theme registry is `colorMode`.
- The `--bs-*` variables. A small fixed palette (`--base-white`, `--base-light`,
  `--base-dark`, `--base-secondary`, `--base-success`, `--base-info`,
  `--base-warning`, `--base-danger`, `--base-border`, `--base-link*`) in
  `styles/tailwind.css` backs the semantic tokens. Themes retint
  `--base-secondary` where they used to retint `--bs-secondary`.
- Dead theme rules that only existed for Bootstrap: `--bs-primary*`,
  `--bs-table-*`/`.table` ledger overrides and the `.dropdown-menu` overrides in
  Cuvée and Remuage (no markup emits those classes), universal
  `* { box-sizing }` and `img, video { max-width }` resets (preflight does both).
- The `tw:` prefix, utility-wide `important`, `data-tailwind-migrated` markers,
  `e2e/style-coexistence.ts` and its two coexistence specs,
  `scripts/generate-legacy-classes.mjs`, `scripts/audit-theme-selectors.mjs`,
  `.oxlint-legacy-exceptions.json`, the generated allow-list and its `.gitignore`
  entry, the `postcss`/`postcss-selector-parser` dev dependencies,
  `tailwind.prefix` in `components.json` and the prefix option of `cn`.

## Cascade layers

`styles/tailwind.css` declares `@layer theme, base, vendor, components,
utilities`.

| Layer | Contents |
| --- | --- |
| `theme` | Tailwind theme variables |
| `base` | Tailwind preflight, the fixed `--base-*` palette, `--surface-*` tokens and the document defaults below |
| `vendor` | Leaflet (`@import … layer(vendor)` in `tailwind.css`) and Swiper (`components/marqueeSliderVendor.css`, lazy with the carousel) |
| `components` | `data-slot` rules in `tailwind.css`, `admin.css`, `analyticsDashboard.css`, `announcementBanner.css`, `maintenancePage.css`, `ThemeSwitcher.css` and every runtime theme (`public/themes/*.css` wrap their rules in `@layer components`; `theme-remuage.css` imports its partials with `layer(components)`) |
| `utilities` | Tailwind utilities, unprefixed and without `!important` |

Consequences, and the rules that follow from them:

- A utility on an element beats owned CSS and theme CSS in the normal cascade.
  Owned CSS stays authoritative only where it is `!important` or targets an
  element without that utility.
- Unlayered CSS beats every layer. A new stylesheet must declare its rules inside
  a layer. `e2e/cascade-layers*.spec.ts` assert that no style rule is unlayered
  under all five themes (public and admin) and that a utility overrides an owned
  rule without `!important`.
- Layer order beats specificity. Vendor CSS sits *below* owned CSS, so an owned
  universal selector (`*`, `img`) would override a vendor class rule. That is why
  the themes' universal resets were deleted rather than layered.
- Within `components`, ordering is unchanged from the coexistence setup (bundled
  sheets, then the appended theme `<link>`; specificity decides ties).

### Dormant declarations that became live

While utilities were `!important` and legacy CSS unlayered, layered important
declarations beat unlayered important ones. Several theme declarations
therefore never applied. Removing `important` would have activated them and
changed the rendered pages, so each was resolved to preserve what users saw
before:

- Theme tokens written with the unprefixed Tailwind names while utilities read
  the prefixed ones (`--radius-md` on Remuage form controls, `--font-weight-medium`
  on Remuage). The ones that were live under the prefix (`--tw-radius-md` for
  buttons) are renamed to `--radius-md`; the two that were dormant were deleted.
- `!important` on properties that a utility also sets on the same element
  (event-card margin/border in Cuvée, Riviera and Remuage; Refresh footer link
  colour, schedule tab justification, standalone navbar alignment, privacy
  section padding; Riviera section subtitle margin; Remuage admin title colour).
  The `!important` was dropped from those declarations, so the utility keeps
  winning as before and the rule still applies wherever no utility does.

## Preflight and the document defaults

Bootstrap's reboot is replaced by Tailwind preflight. Preflight zeroes heading,
paragraph, list and link styling that the app, and the sanitised policy
markdown it renders, were designed against. The `base` layer restores exactly
those defaults (heading sizes, weights and margins; paragraph, list, `dl`,
`blockquote`, `figure` and `pre` spacing; `strong`, `small`, `hr`, `label`,
`legend`, `fieldset`, `th`, `caption`; link colours; inline `img`/`svg`; pointer
cursor on enabled buttons; native button padding and form-control font weight).
Everything above `base` still overrides them. Preflight's own differences that
did not alter any rendered page (for example `max-width: 100%` on images,
`border-style` on every element, `color: inherit` on form controls) are kept.

## Lint

`pnpm lint` is plain `oxlint`. `.oxlintrc.json` enables the four shadcn rules
directly. `no-unknown-classes` and `no-raw-colors` carry no generated
allow-list. The single remaining allowance is the list of owned class-name
namespaces (`admin-*`, `site-*`, `riviera-*`, …) whose rules live in the owned
stylesheets; every other class must be one Tailwind can generate, which also
caught a leftover Bootstrap `border-top`. There is no frozen exception baseline;
geometry that is genuinely computed keeps its scoped `oxlint-disable` comments.

Class and variable collisions between owned CSS and Tailwind were audited
against Tailwind's design system before removing the prefix: the only owned
class name Tailwind also generates was the dead `.table` selector (deleted).
Theme variables in Tailwind's namespaces are listed under "Dormant declarations".

## Other changes

- Server-rendered crawler fragments (`backend/app/services/public_render.py`)
  used `container py-5`; they now carry one inline wrapper style, since the shell
  ships no framework CSS for them.
- `AreaIcon` data keys such as `bi-shop` are persisted identifiers, not CSS
  classes; they stay (documented on the model) and map to Lucide icons.

## Size

Same-dependency production builds of the commit before and after (KiB for JS as
in the CI budget; kB for CSS):

| Measure | Before | After |
| --- | --- | --- |
| JS, all chunks | 2 563 KiB (766 722 B gzip) | 2 504 KiB (760 249 B gzip) |
| `index` chunk | 776 KiB | 774 KiB |
| `AdminDashboard` chunk | 946 KiB | 937 KiB |
| CSS, all files | 350 kB raw, 53 kB gzip | 119 kB raw, 24 kB gzip |
| `index` CSS | 328 kB | 97 kB |

The CI JS budgets are lowered accordingly (total 2 700 → 2 560 KiB, admin
1 300 → 1 000 KiB).

## Verification

- A computed-style comparison of every element on the public pages (home,
  privacy, `/me`, maintenance, registration dialog, admin login) under all five
  themes, light and dark, at 1 440 and 390 px, and of all 16 admin sections under
  all five themes at 1 440 px, between the commit before and this change. It
  found the dormant declarations above; after resolving them the only remaining
  differences are native form-control default colours and preflight's `max-width: 100%` on
  images.
- A full-page screenshot pixel comparison of the same matrix (plus the admin at
  390 px) is identical except for sub-pixel anti-aliasing of native date inputs and
  the blurred dialog backdrop.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`
  (including the service-worker build) and the full Playwright suite pass.
