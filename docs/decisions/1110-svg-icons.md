# SVG icons (#1110)

Fixed icons import Lucide components directly; `Icon` provides decorative SVG
attributes, inherited colour and an `em` size. Icon-only controls need accessible
labels. Informational badges retain text or screen-reader labels. Icons use outline
strokes; Lucide has no brand icons, so the Facebook link uses `ExternalLinkIcon`
alongside its Facebook text.

Saved floor-plan `bi-*` identifiers remain API data. [AreaIcon](../../frontend/src/components/AreaIcon.tsx)
maps supported values to Lucide and falls back to `StoreIcon` for unknown values.
The complete mapping belongs to that implementation; the former icon-font inventory
and migration validation remain in Git. Bootstrap icon dependencies and fonts
were removed in [#1111](1111-bootstrap-removal.md).
