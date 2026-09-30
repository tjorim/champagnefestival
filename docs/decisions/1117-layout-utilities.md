# Layout and utility migration

Issue: [#1117](https://github.com/tjorim/champagnefestival/issues/1117), under
[#1103](https://github.com/tjorim/champagnefestival/issues/1103).
Implementation: 2026-09-30. This records local implementation and verification;
review and screenshot publication on the eventual PR remain outstanding.

## Scope and behavior

All nine scoped Container/Row/Col importers now render semantic HTML. Ordinary
static spacing, display, flex alignment, column sizing, typography, positioning,
overflow and accessible hidden text also migrate throughout `src/`, including
already migrated widgets, loading/error paths, the footer and `main.tsx`.
Bootstrap's spacing scale is translated explicitly: 3/4/5 become Tailwind 4/6/12.
The site breakpoints remain 576/768/992/1200/1400px; default Tailwind breakpoints
are not substituted. Responsive columns retain their DOM order and gutters.
Standalone headers retain fixed positioning, and existing main/anchor offsets
remain under the runtime themes. The account wrapper retains its 540px cap.

The site-specific `site-container` and `site-content-column` hooks preserve the
five themes' artwork, surfaces, padding and width overrides. Column widths and
horizontal padding use scoped variables so important Tailwind utilities still
respect Remuage's full-width panels and privacy-document surfaces. Text colour
utilities use semantic tokens with local theme variables, preserving standalone
public colours and fixed-dark administrator/portal colours. No preflight or
runtime stylesheet ordering change is introduced.

Form controls, cards/lists, buttons/groups and feedback renderers remain with
#1118–#1122. Their surface classes (`bg-*`, `border-*`, `rounded*`, `shadow-*`)
and the CSS that styles those controls retain those owners. Site artwork,
computed floor-plan/scanner/image geometry, ThemeSwitcher and remaining inline
exceptions retain #1123 ownership. Leaflet/Swiper vendor styles remain required.
No API, validation, business state or write/retry strategy changes are made.

## Source and selector audit

Re-audit of this worktree, rather than reusing #1109's older planning counts:

| Measure | Before | After |
| --- | ---: | ---: |
| Container/Row/Col importer files | 9 | 0 |
| Ordinary layout-family literal references in `src/` and `tests/` | 2,447 | 2 |
| Distinct referenced ordinary layout-family tokens | 136 | 1 |
| Generated legacy allow-list entries | 2,266 | 2,270 |
| Generated layout-family entries | 1,318 | 1,313 |
| Frozen file exceptions | 40 | 36 |

Literal counts include quoted/template class tokens and className layout hooks,
excluding semantic `scope="col"`, tag names and prose mentioning rows/containers.
The two remaining references are `p-4` in `tests/lib/utils.test.ts`, which
intentionally verifies prefix-aware coexistence. The E2E cascade probe likewise
keeps `p-4` deliberately. No application reference remains. The family covers
container/row/columns, display, spacing/gutters, flex alignment, positioning,
width/height, text/font utilities, overflow, hidden text and centring transforms.
It includes the removed custom `fs-*` sizes as well as Bootstrap utilities.

The generated allow-list still includes vendor Bootstrap layout classes. Its
small increase reflects owned layout hooks/escaped Tailwind selectors replacing
legacy theme hooks; it is not evidence of an expanded frozen exception baseline.
The generator's current top-level theme inputs produce the table above. A
separate recursive selector audit including Remuage imports counts 2,285 → 2,290
distinct vendor/owned classes. Neither count includes Bootstrap Icons, removed
by #1110 after #1109's planning snapshot.

Removed the obsolete owned `fs-*` and `visually-hidden` selectors. Retargeted
container, column and ordinary utility selectors throughout all five themes and
admin CSS to migrated markup. Retained theme selectors encode the design noted
above; retained control/vendor selectors belong to the explicit follow-ups.
Removed inline exceptions for CheckInPage, MyAccountPage, MapComponent and
main.tsx. Other exceptions still cover the custom/control work described above.
Regenerated the allow-list with `pnpm lint`; it is not hand-edited or committed.

Final searches:

```sh
rg 'react-bootstrap/(Container|Row|Col)' frontend/src
rg --pcre2 '(?<![\w:-])(?:d-(?:flex|grid|block|none|inline-flex)|(?:m[bestxy]?|p[bestxy]?|gap)-(?:[a-z]+-)?[0-5]|position-(?:relative|absolute)|translate-middle|text-(?:secondary|light|warning|center|start|end)|fw-(?:bold|normal|semibold)|fs-(?:[56]|[235]xs)|visually-hidden|w-100|h-100)(?![\w:-])' frontend/src
```

The import search returns no matches. The utility search returns only the
historical `text-warning overrides` comment in admin.css. Manual review also
covers raw row/column/container class attributes and template expressions.

## Verification and publication gate

- Targeted account/check-in/edit-form/image/heading interactions: 56 tests pass.
- Full unit suite: 755 tests pass with two workers; the bulk-selection test also
  passes independently. At unrestricted concurrency its five-second timeout
  was exceeded, so concurrency was reduced without changing the test.
- Follow-up map/scanner tests: 15 pass; floor-plan tests: 22 pass.
- `pnpm format:check`, lint, typecheck and app/service-worker builds pass. Lint
  retains existing warnings; no new suppression or baseline entry is added.
- `layout-utilities.spec.ts` covers all five themes, light/dark and 1440/390px,
  checks horizontal overflow, fixed-header/title offsets and keyboard focus,
  and explicitly verifies the 575/576/767/768/991/992px breakpoint boundaries.
  It attaches loaded privacy-document and admin-login screenshots.
- Authenticated account/check-in tests now cover light/dark as well as all five
  themes and desktop/mobile, with screenshots of those views and fixed-dark
  admin. Existing dialog, table, navigation and theme interaction checks remain.
- Full Playwright suite: 127 tests pass on a dedicated port with two workers.
  The initially reused 5173 port was replaced by another app during the session;
  verification therefore uses `PLAYWRIGHT_PORT=5187`.
- The coexistence helper excludes prefixed layout ancestors, whose dependence
  on Tailwind is intentional. Responsive/theme tests above replace the old
  assumption that those ancestors are still Bootstrap layouts. The explicit
  legacy cascade probe remains covered.

Screenshot attachments are generated under `frontend/test-results/`; preserve
and attach them to the eventual PR. #1117 remains active pending review and that
publication gate. #1111 stays blocked by the remaining migration groups and
must still remove Bootstrap/reboot, prefixes, important utilities, migration
markers and general legacy lint tooling in its own verified change.
