# Runtime theme tokens

Issue: [#1105](https://github.com/tjorim/champagnefestival/issues/1105).

## Model and loading

All five themes keep their public runtime stylesheets and existing link order.
Bundling the legacy component rules would change the cascade. Theme identity is
`data-visual-theme`; Classic's variable declarations are scoped to that identity.
The semantic `--surface-*` bridge in the bundled Tailwind stylesheet consumes
existing theme variables for Refresh, Classic, Riviera and Cuvée. Remuage
maps its standalone `--rem-*` palette directly to `--surface-*` on
`html[data-visual-theme="remuage"]`; it does not define the legacy variables.
Tailwind and future Base UI primitives consume these semantic tokens. As each
component migrates, its legacy rules can be removed independently. Classic's
header is the first complete markup → utility → token → runtime-theme prototype.
This does not claim the entire Classic page has ceased using Bootstrap.

`src/config/visualThemes.json` is the metadata source. Vite injects it into the
synchronous inline pre-paint script in development and production; React imports
it through the typed registry. Storage failure falls back to Refresh. Browser
chrome colours and system-mode changes retain their existing behaviour.
`data-theme-mode` drives Tailwind's dark variant; `data-bs-theme` mirrors it
until Bootstrap is removed. Refresh follows the system; Classic is dark;
Riviera, Cuvée and Remuage are light. Theme selection updates both attributes.

## Admin and portals

The admin page uses `data-theme-scope="admin"` and `data-theme-mode="dark"`.
Its semantic palette is fixed independently of the public theme. The central
AdminModal adapter carries this scope on existing Bootstrap portals, replacing
repeated mode declarations. Existing `--adm-*` rules remain during coexistence.
Wrap future Base UI Portal children with `AdminThemeScope`, including popovers
and dialog backdrops. This explicit wrapper places the scope inside the portal,
where inherited page tokens otherwise cannot reach it. Do not rely on a class
on the trigger or set dark mode on the public document when entering admin.

## Legacy override audit

Classic retains `.container` (public layouts), `.nav-tabs .nav-link` (schedule),
`.accordion*` (FAQ), `.modal-backdrop` (registration), and `.visually-hidden`
(accessible labels). They are still rendered directly or by react-bootstrap.
Classic's migrated header no longer consumes navbar or Bootstrap utility classes;
its stylesheet had no navbar-specific overrides to remove.

Refresh, Riviera, Cuvée and Remuage still render the shared Bootstrap registration,
FAQ and schedule controls. Their navbar, button, modal, form and accordion
selector overrides remain compatibility rules, not token definitions to copy.
The generated [selector inventory](1105-theme-selector-audit.md) records all
Bootstrap class overrides per theme, including the imported companion stylesheets.
Absence of a literal class is not proof of dead CSS: react-bootstrap emits classes, and theme files import additional Remuage CSS.
Classic's unused `.map-iframe*` and `.modal-close-btn*` site hooks are removed
after checking all application sources; the map now uses Leaflet and modals
use framework close controls. No uncertain Bootstrap rules are deleted. Re-run
the inventory as components migrate and remove rules only after their framework and direct consumers are gone.

## Verification contract

Pre-paint browser tests abort the React entry module and check each theme's
identity, resolved mode and browser chrome colour. The Classic token probe checks
actual computed utility colours and a dark portal under a light document.
A Base UI dialog portal test checks scope propagation and accessibility with axe.
The coexistence comparisons exclude explicitly marked migrated subtrees, whose
styles intentionally depend on Tailwind; all remaining legacy markup stays in
the comparison, including the other four public themes and authenticated admin.

Validated locally on 2026-09-29: `pnpm typecheck`, `pnpm lint` (existing warnings),
`pnpm format:check`, `pnpm build`, all 717 existing unit tests plus the new
Base UI portal/axe test, and all 52 Playwright tests with `--workers=1`.
Concurrent runs had intermittent page-load timeouts; the serial full suite and
serial Remuage/token rerun passed.


### Review follow-up: palette completeness and mode assertions

The Worktime review identified missing light-mode aliases and tests that could
pass against the same incorrectly resolved reference variable. CF had the
analogous missing-alias problem in Remuage. Its runtime foundation now supplies
all nine semantic surface tokens from its own palette, leaving legacy rules
and admin scope overrides intact.

Browser coverage checks every theme under both system preferences against
literal expected colours, checks every semantic surface token resolves, checks
card/popover backgrounds, and verifies dark utilities activate only for the
resolved dark mode. Refresh additionally changes light → dark → light without
reloading. Pre-paint coverage now includes both preferences and both browser
chrome colour metadata entries.

Follow-up validation on 2026-09-29: all 68 Playwright tests passed serially,
including the expanded token checks and all public/admin coexistence cases.
Lint (existing warnings), format check, typecheck and both builds also passed.
