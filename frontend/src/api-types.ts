// The API's shapes, as the backend declares them.
//
// `src/api-schema/` is generated from `openapi.json` (`pnpm api:generate`; `pnpm typecheck` fails when it is
// stale) and holds one type per schema, named as the backend names it: `OrganizationOut`, `ProductCreate`.
// Screens import every API shape from here, never from `api-schema/` directly, and declare no API record by
// hand. When a screen wants a friendlier name, alias the generated type below instead of copying its fields.
export type * from "./api-schema";
