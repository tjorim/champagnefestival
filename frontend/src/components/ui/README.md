# Base UI primitives

Generate primitives here on demand with `pnpm dlx shadcn@latest add <component>`
from `frontend/`. `components.json` selects Base UI, Lucide, the `tw:` prefix and
our existing runtime theme tokens. Restyle generated source to pass the four
shadcn lint rules. The foundation step (#1104) deliberately adds no controls.
