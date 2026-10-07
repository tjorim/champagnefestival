# Runtime theme tokens

Issue: [#1105](https://github.com/tjorim/champagnefestival/issues/1105).

## Model and loading

All five themes keep their public runtime stylesheets. Theme identity is
`data-visual-theme`; Classic's variable declarations are scoped to that identity.
The bundled semantic `--surface-*` bridge consumes theme variables for Refresh,
Classic, Riviera and Cuvée. Remuage maps its `--rem-*` palette directly to those
surface tokens. Tailwind and owned Base UI primitives consume the semantic tokens.
Stylesheets use the [current cascade layers](1111-bootstrap-removal.md#cascade-layers).

`frontend/src/config/visualThemes.json` owns theme metadata. Vite injects it into
synchronous pre-paint code; React imports it through the typed registry. Storage
failure falls back to Refresh. `data-theme-mode` drives Tailwind's dark variant:
Refresh follows the system, Classic is dark, and Riviera, Cuvée and Remuage are light.
The pre-paint script also sets browser chrome colours before React loads.

## Admin and portals

The admin scope uses `data-theme-scope="admin"` and `data-theme-mode="dark"`,
with a fixed semantic palette independent of the public theme. Wrap Base UI
Portal children with `AdminThemeScope`, including popovers and dialog backdrops,
so the scope is present inside the portal. A class on the trigger cannot provide
that scope; entering admin does not change the public document's mode.
