# Tailwind coexistence with Bootstrap and runtime themes

Issue: [#1104](https://github.com/tjorim/champagnefestival/issues/1104).

## Cascade spike and decision

Tailwind's normal layered utilities lose to unlayered Bootstrap, admin and
runtime theme rules. Wrapping all legacy CSS in a lower normal layer would
solve normal declarations, but reverse important-layer precedence can still
break Bootstrap utilities. It would also change the relationship between
legacy CSS and third-party Leaflet/Swiper styles, increasing regression risk.

Keep legacy styles unlayered and unchanged. Import only Tailwind's theme and
utilities layers, with `prefix(tw)` on both and `important` on utilities.
Layered important declarations beat unlayered important declarations, so an
explicit `tw:p-0` beats both `.btn` padding and Bootstrap's `.p-4 !important`.
This is a temporary migration strategy: reconsider important utilities when
Bootstrap and legacy theme selectors have been removed. Inline important
styles remain stronger and should not be introduced.

The prefix is necessary independently of layer precedence: existing `p-4`,
`gap-2`, `container`, `text-center` and similar names must retain their original
Bootstrap meanings. The shared `cn` is configured for the same prefix so it
preserves Bootstrap classes and resolves Tailwind conflicts correctly.

There is no preflight import; Bootstrap reboot remains in charge. Runtime theme
links are still appended after the Bootstrap stylesheet by `initializeVisualTheme`.
Theme tokens map to existing theme variables rather than installing a default
shadcn palette. No app markup or runtime theme styles are migrated in this step.

References: [Tailwind selective imports](https://tailwindcss.com/docs/preflight),
[Tailwind important and prefix options](https://tailwindcss.com/docs/styling-with-utility-classes).

## Transitional lint policy

`pnpm lint` parses real selectors with PostCSS and postcss-selector-parser and
writes an ignored, generated Oxlint config. It covers Bootstrap, Bootstrap
Icons, Leaflet, Swiper, all five runtime themes and all component stylesheets.
CSS-backed legacy colour classes also bypass Tailwind token checking. The
`tw:*` deny entry prevents these exceptions from permitting prefixed legacy
classes on new controls.

Existing inline-style properties and undefined class hooks are frozen in a
separate file-specific baseline. Most inline exceptions permit only properties
already used by that file. LayoutEditor's computed style object and
MaintenancePage's embedded stylesheet require whole-rule exceptions until
migration. No new file inherits these exceptions. Undefined classes are retained
rather than removing hooks or inventing CSS that could change the current UI.
Remove each exception as its owning component is migrated.

## Verification

`e2e/tailwind-coexistence.spec.ts` checks important padding precedence under all
five themes and compares existing public DOM computed styles with the Tailwind
stylesheet enabled and disabled. Authenticated admin coverage uses the same
computed-style comparison. The main Vite build owns Tailwind; the separate
service-worker build has no CSS and retains its existing config.
