# Self-hosted fonts

Variable WOFF2 files, so visitors' browsers never contact a third-party font service
(no visitor IP is sent to Google). Declared in `src/styles/fonts.css` (Inter) and
`public/themes/theme-cuvee.css` (Fraunces).

| File                                                                   | Family   | Source                                |
| ---------------------------------------------------------------------- | -------- | ------------------------------------- |
| `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2`   | Inter    | `@fontsource-variable/inter` 5.x      |
| `fraunces-latin-opsz-normal.woff2`, `fraunces-latin-opsz-italic.woff2` | Fraunces | `@fontsource-variable/fraunces` 5.3.0 |

Both families are licensed under the SIL Open Font License 1.1 (Inter © The Inter Project
Authors, Fraunces © The Fraunces Project Authors). To update, download the same files from the
Fontsource packages (`npm pack <package>`, then copy from `package/files/`) and keep the file names.
