# Base UI primitives

Generate primitives here on demand with `pnpm dlx shadcn@latest add <component>`
from `frontend/`. `components.json` selects Base UI, Lucide, the `tw:` prefix and
our existing runtime theme tokens. Restyle generated source to pass the four
shadcn lint rules. The foundation step (#1104) deliberately adds no controls.

Mark each Tailwind-dependent primitive root with `data-tailwind-migrated="true"`.
Also mark migrated layout wrappers (such as table pagination) at their narrowest
root. The stylesheet coexistence tests disable Tailwind and compare only legacy
subtrees; migrated roots and their descendants intentionally depend on it.
Keep the surrounding Bootstrap layout outside these markers so it remains covered.
