# Owned cards and lists

Issue: [#1118](https://github.com/tjorim/champagnefestival/issues/1118).
Local implementation: 2026-09-30. This does not authorize Bootstrap removal.

## Implementation

Generated Card with the committed `base-vega` shadcn configuration, then moved
it from the CLI's literal `@/` output directory into `src/components/ui` and
restyled it with the shared prefix-aware `cn` helper. Card, header, content,
footer and heading slots preserve the existing composition and heading levels.
Status borders use an owned `tone` prop; defaults consume runtime surface tokens.
Default padding and radii live in ordinary CSS so runtime theme artwork can
still override them; explicit caller spacing uses `tw:` utilities.

ListGroup becomes owned `ul`/`li` presentation. Actionable search rows render a
native `type="button"` inside an `li`, preserving names, focus, keyboard
activation and disabled behavior without submitting surrounding forms. Flush
lists retain their border geometry. Domain components and their state, loading,
error, empty, grouping and write behavior are unchanged. No write operation or
retry strategy changed, so `docs/retry-safety.md` needs no new entry.

## Final source audit

- Before: 25 Card importers and 13 ListGroup importers across 31 unique files.
  After: zero imports of either Bootstrap renderer throughout `frontend/src`.
- No raw Bootstrap card/list class markup remains in application source.
  Search: `rg 'react-bootstrap/(Card|ListGroup)|Card\.|ListGroup' frontend/src`.
- Before: 29 card/list selector references in recursive runtime theme CSS and
  five in admin CSS. After: zero legacy card/list selectors. Theme rules now
  target stable `data-slot` hooks. Classic needed no selector replacement.
- The generated vendor card/list class family remains 34 before and after;
  Bootstrap still supplies the vendor stylesheet until #1111. Regenerated via
  `pnpm lint`, never edited manually.
- Frozen exception entries decrease from 36 to 34. Removed all three
  `admin-card` allowances (PolicyManagement retains its unrelated textarea
  exception). Remaining inline exceptions belong to form controls, images,
  floor-plan positioning and custom views owned by #1119/#1120/#1123; this
  presentation migration does not expand the baseline.
- Retained custom artwork: event-card, marquee-card, maintenance flyer,
  Riviera features, admin skeletons and vendor Leaflet/Swiper surfaces. These
  are domain/design hooks, not Bootstrap card/list renderers. Forms, feedback
  badges and buttons inside cards retain their separate migration owners.

## Verification and evidence

The keyboard list test covers Enter/Space activation, native disabled state,
list semantics and prevention of accidental form submission. Existing content,
venue, layout and bulk-selection tests cover changed presentation containers.
Playwright covers check-in, registrations, public widgets and authenticated
account/admin views. The card/list matrix covers five themes, both colour-scheme
preferences and 1440/390px viewports, checks semantic lists and absence of legacy
DOM classes, and attaches public/admin screenshots (40 images per run).

Screenshots are generated under `frontend/test-results/cards-lists*`; a local
review copy is kept in `/tmp/1118-evidence`. They are untracked test artifacts.
The collaborative preview navigates successfully but its snapshot operation
fails in this environment; automated Playwright screenshots provide the visual
verification evidence.

Keep #1118 active until review and screenshot publication on an eventual PR.
#1111 remains blocked by the other migration groups and its own cleanup gates.
The original #1109 finding and inventory remain historical context.

Final checks: `pnpm format:check`, `pnpm lint` (existing warnings only),
`pnpm typecheck`, 760 unit tests (`pnpm exec vitest run --maxWorkers=4`),
app and service-worker builds, 44 existing relevant Playwright checks, and
21 card/list matrix checks including auth setup all pass. An initial full-suite
bulk-selection timeout passed both its targeted rerun and the final full suite.
The first typecheck raced Vite’s translation generation; the final sequential
check and build pass after stopping the development servers.
