# Base UI primitives

Generate primitives here on demand with `pnpm dlx shadcn@latest add <component>`
from `frontend/`. `components.json` selects Base UI, Lucide and our runtime theme
tokens (`src/styles/tailwind.css`). Own and restyle the generated source so it
passes the four shadcn lint rules (`pnpm lint`).

Utilities are unprefixed and not `!important`. Runtime themes, vendor CSS and
the owned stylesheets live in cascade layers beneath the `utilities` layer, so a
utility on an element wins over them; style a primitive through its `data-slot`
and variant hooks in the owned CSS and through utilities in its source.
