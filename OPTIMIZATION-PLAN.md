# Code Review & Optimization Plan

> Expert review of the current `champagnefestival` implementation (React + Vite frontend,
> FastAPI backend) against the established conventions in `AGENTS.md` / `README.md`, followed by
> an atomic, sequenceable optimization plan. Every step preserves existing functionality, honors
> the project rules (American English, Paraglide i18n, strict TypeScript, targeted-tests-first),
> and touches no more than 20 files.

<analysis>
Here is my detailed review of the current codebase.

## 1. Code Organization & Structure

**Strengths**
- Clear top-level separation: `frontend/` (SPA) and `backend/` (FastAPI), each with its own
  README, lockfile, Dockerfile, and CI workflow. Production hosting is deliberately kept out of
  the repo (infra stack), which keeps concerns clean.
- Frontend follows a sensible folder taxonomy (`components/`, `config/`, `hooks/`, `utils/`,
  `types/`, `state/`, `mocks/`) and centralizes cross-cutting concerns well: query keys live in
  `utils/queryKeys.ts`, API mappers in `utils/adminApiMappers.ts`, and the MSW mock layer is
  documented thoroughly and shared between dev and tests.
- Backend routers are split per resource (`areas`, `rooms`, `tables`, `editions`, `registrations`,
  …) and wired in one place (`app/main.py`). Alembic migrations are versioned and ordered.
- Test coverage is broad on both sides (≈25 backend test modules, ≈30 frontend test files).

**Weaknesses / opportunities**
- **`AdminDashboard.tsx` is a 2,224-line god-component.** It hosts 34 `useMutation` definitions
  and 58 `invalidateQueries` calls spanning every admin domain (people, members, volunteers,
  registrations, venue, layouts, table types, content/editions). This is the single largest
  structural liability: it concentrates unrelated business logic, makes the file hard to review,
  defeats memoization, and forces every admin domain change through one merge-prone file.
- **`mcp_server.py` (1,106 lines) is a single `ChampagneFestivalMcpBackend` class.** All tool
  implementations live in one module, mirroring the dashboard problem on the backend.
- **`LayoutEditor.tsx` (1,675 lines)** mixes pure geometry helpers (`getTablesInArea`,
  rotation math), drag-and-drop wiring, and modal/UI rendering in one file. The geometry is
  pure and unit-testable but currently un-extracted.
- **Per-router CRUD duplication.** `areas.py` and `rooms.py` (and peers) each re-declare an
  identical private `_get_or_404` helper and the same create/list/get/update/delete shape. This
  boilerplate is repeated across ~8 resource routers.

## 2. Code Quality & Best Practices

**Strengths**
- Strict TypeScript discipline: **zero `any`** across `src` and only 3 lint/ts suppression
  comments in the whole frontend — excellent.
- Modern, consistent stack (React 19, TanStack Query/Router/Table/DB, Paraglide). Mutation
  success handlers consistently invalidate the right query keys.
- Backend uses typed async SQLAlchemy, a global `IntegrityError` handler returning 409, request
  correlation/observability middleware, rate limiting, and a spam/honeypot guard on public
  registration — all signs of a maturely-hardened service.
- Dev logging is funneled through `utils/devLog.ts` rather than raw `console`.

**Weaknesses / opportunities**
- The 58 near-identical `invalidateQueries({ queryKey: xQueryKey })` calls in `AdminDashboard`
  are copy-paste prone — a domain typically invalidates the same 2–4 keys. A small
  `invalidateAdmin(queryClient, [...])` helper (or per-domain mutation hooks) removes the
  repetition and the risk of forgetting a key.
- Error handling in the dashboard collapses everything into a single `setError("")` string; there
  is one error channel for many independent mutations, so a failure in one area can be masked or
  mislabeled by another.
- Backend resource routers would benefit from a shared `get_or_404(db, Model, id)` utility instead
  of N copies of `_get_or_404`.
- `app/main.py` builds CORS middleware with a bespoke `_MCPAwareCORSMiddleware` inline class; this
  is correct but undocumented and untested, and belongs in a small dedicated module.

## 3. UI/UX

**Strengths**
- Strong baseline accessibility: **289 `aria-*` usages** across components, semantic React-Bootstrap
  primitives, and a `LayoutEditor` explicitly built on accessible `@dnd-kit` drag-and-drop.
- Full i18n via Paraglide for `nl`/`en`/`fr`, with a documented rule never to hardcode strings.
- Thoughtful demo/operations affordances: MSW scenario switching, deterministic auth fixtures, and
  stable routes for screenshot/AI agents.

**Weaknesses / opportunities**
- Only **4 `alt=` attributes** appear in `.tsx`, despite a shared `ResponsiveImage` component. Worth
  auditing that every decorative vs. informative image is correctly labeled (or `alt=""`).
- The single global error string in the admin dashboard surfaces as one banner; users acting on a
  specific entity (e.g., deleting a person) may not see the error contextually near their action.
- `MIGRATION-PLAN.md` already flags accessibility-audit depth and performance-budget enforcement as
  open items; there is no CI bundle-size budget gate yet.
</analysis>

# Optimization Plan

> Steps are ordered so each can be implemented and verified independently. Run the relevant
> targeted tests after each step (`pnpm test` / `uv run pytest`), then `pnpm typecheck` + `pnpm lint`
> (frontend) or `uv run ruff check app` + `uv run ty check app` (backend) before handoff.

## Code Structure & Organization

- [ ] **Step 1: Add a shared admin query-invalidation helper**
  - **Task**: Introduce `invalidateAdmin(queryClient, keys)` that accepts an array of query keys and
    issues the `void queryClient.invalidateQueries(...)` calls in one place. Replace the 58 inline
    invalidation calls in `AdminDashboard.tsx` with it. No behavior change — same keys invalidated.
  - **Files**:
    - `frontend/src/utils/queryInvalidation.ts`: new helper + unit-testable signature.
    - `frontend/src/components/admin/AdminDashboard.tsx`: swap inline calls for the helper.
    - `frontend/tests/utils/queryInvalidation.test.ts`: assert it forwards each key.
  - **Step Dependencies**: None.
  - **Success Criteria**: All admin tests pass; no `invalidateQueries` call remains duplicated;
    typecheck/lint clean.

- [ ] **Step 2: Extract people/members/volunteers mutations into `usePeopleMutations`**
  - **Task**: Move the create/update/delete `useMutation` definitions for people, members, and
    volunteers (currently ~10 mutations) out of `AdminDashboard.tsx` into a colocated hook that
    receives `queryClient`, `authHeaders`, and the relevant query keys and returns the mutation
    objects. Dashboard consumes the hook; UI and behavior unchanged.
  - **Files**:
    - `frontend/src/hooks/usePeopleMutations.ts`: new hook.
    - `frontend/src/components/admin/AdminDashboard.tsx`: replace inline mutations with hook usage.
    - `frontend/tests/hooks/usePeopleMutations.test.ts`: smoke test mutationFn wiring.
  - **Step Dependencies**: Step 1 (use the helper inside the hook).
  - **Success Criteria**: `AdminDashboard.tsx` shrinks by the moved mutations; people/member/
    volunteer tests still pass.

- [ ] **Step 3: Extract venue/layout/table-type mutations into `useVenueMutations`**
  - **Task**: Same pattern as Step 2 for the venue, room, table, table-type, area, and layout
    mutations. Keep `LayoutEditor` integration intact by passing the hook's results down unchanged.
  - **Files**:
    - `frontend/src/hooks/useVenueMutations.ts`: new hook.
    - `frontend/src/components/admin/AdminDashboard.tsx`: consume the hook.
    - `frontend/tests/hooks/useVenueMutations.test.ts`: smoke test.
  - **Step Dependencies**: Step 1.
  - **Success Criteria**: Venue/layout admin tests pass; dashboard mutation count materially reduced.

- [ ] **Step 4: Extract registration mutations into `useRegistrationAdminMutations`**
  - **Task**: Move registration create/update/delete/merge and check-in-related mutations into a
    dedicated hook, completing the dashboard slim-down.
  - **Files**:
    - `frontend/src/hooks/useRegistrationAdminMutations.ts`: new hook.
    - `frontend/src/components/admin/AdminDashboard.tsx`: consume the hook.
    - `frontend/tests/hooks/useRegistrationAdminMutations.test.ts`: smoke test.
  - **Step Dependencies**: Step 1.
  - **Success Criteria**: `AdminDashboard.tsx` is reduced to orchestration/layout; all admin tests
    green. Target: dashboard well under ~1,000 lines.

- [ ] **Step 5: Extract pure geometry helpers from `LayoutEditor`**
  - **Task**: Move pure functions (`getTablesInArea`, rotation/containment math, and any
    px/coordinate conversions not already in `layoutUtils.ts`) into `utils/layoutGeometry.ts` and
    add focused unit tests for the rotation edge cases. `LayoutEditor` imports them.
  - **Files**:
    - `frontend/src/utils/layoutGeometry.ts`: new pure module.
    - `frontend/src/components/admin/LayoutEditor.tsx`: import instead of inline-define.
    - `frontend/tests/utils/layoutGeometry.test.ts`: cover rotated-area containment.
  - **Step Dependencies**: None.
  - **Success Criteria**: New geometry tests pass; `LayoutEditor` behavior unchanged; the math is
    now independently tested.

## Code Quality & Best Practices

- [ ] **Step 6: Add a shared `get_or_404` backend helper and adopt it in resource routers**
  - **Task**: Add a generic `get_or_404(db, Model, id, detail=...)` to `app/utils.py` (or a new
    `app/crud.py`) and replace the per-router `_get_or_404` copies in `areas.py` and `rooms.py`
    first (the clearest duplicates), preserving each router's existing 404 message text.
  - **Files**:
    - `backend/app/utils.py`: add `get_or_404`.
    - `backend/app/routers/areas.py`, `backend/app/routers/rooms.py`: adopt it.
    - `backend/tests/test_areas.py`, `backend/tests/test_rooms.py`: confirm 404 behavior unchanged.
  - **Step Dependencies**: None.
  - **Success Criteria**: `uv run pytest tests/test_areas.py tests/test_rooms.py` passes; no
    behavior or status-code change.

- [ ] **Step 7: Roll out `get_or_404` to remaining CRUD routers**
  - **Task**: Apply the Step 6 helper to `tables.py`, `table_types.py`, `venues.py`, `layouts.py`,
    and any other router still carrying a private `_get_or_404`. One small change each.
  - **Files** (≤20): the listed routers + their existing test modules (no new tests required).
  - **Step Dependencies**: Step 6.
  - **Success Criteria**: Full backend suite green; the `_get_or_404` pattern no longer duplicated.

- [ ] **Step 8: Extract the MCP-aware CORS middleware into its own module**
  - **Task**: Move the inline `_MCPAwareCORSMiddleware` class and CORS-kwargs construction out of
    `main.py` into `app/middleware.py`, with a single factory `add_cors_middleware(app, settings)`.
    Add a focused test asserting `/mcp` paths bypass CORS and other paths don't.
  - **Files**:
    - `backend/app/middleware.py`: new module.
    - `backend/app/main.py`: call the factory.
    - `backend/tests/test_cors_middleware.py`: new test.
  - **Step Dependencies**: None.
  - **Success Criteria**: App boots; existing health/request-correlation tests pass; new CORS test
    passes.

- [ ] **Step 9: Split `mcp_server.py` tool implementations by domain**
  - **Task**: Without changing the registered tool surface, split the 1,106-line module so seating,
    orders, delivery, and check-in tool bodies live in separate domain modules imported by
    `create_mcp_server`. Keep `ChampagneFestivalMcpBackend` as the thin assembling class.
  - **Files** (≤20): `backend/app/mcp/__init__.py`, `backend/app/mcp/seating.py`,
    `backend/app/mcp/orders.py`, `backend/app/mcp/delivery.py`, `backend/app/mcp/check_in.py`,
    `backend/app/mcp_server.py` (now an assembler), `backend/tests/test_mcp_server.py` (unchanged
    assertions).
  - **Step Dependencies**: None.
  - **Success Criteria**: `uv run pytest tests/test_mcp_server.py` passes unchanged; tool names and
    schemas identical.

## UI/UX

- [ ] **Step 10: Give the admin dashboard per-domain error surfacing**
  - **Task**: Replace the single global `error` string with a small typed error map (or per-section
    error state) so a failed people-mutation shows near People and a failed venue-mutation near
    Venue. Keep using Paraglide strings; no new hardcoded text.
  - **Files**:
    - `frontend/src/components/admin/AdminDashboard.tsx`: section-scoped error state.
    - `frontend/src/components/admin/*Management.tsx`: accept/display the scoped error prop
      (touch only the sections that mutate; keep within ≤20 files).
    - `frontend/tests/components/...`: extend an existing admin test to assert scoped error display.
  - **Step Dependencies**: Steps 2–4 (mutations already extracted, so onError can set scoped state).
  - **Success Criteria**: A simulated mutation failure renders its message in the correct section;
    existing tests pass.

- [ ] **Step 11: Audit image alternative text via `ResponsiveImage`**
  - **Task**: Review every `ResponsiveImage`/`<img>` usage and ensure informative images carry
    descriptive (i18n) `alt` text and decorative ones use `alt=""`. Add a lightweight test that
    `ResponsiveImage` forwards `alt` correctly.
  - **Files**:
    - `frontend/src/components/ResponsiveImage.tsx`: ensure `alt` is required/forwarded.
    - call sites missing meaningful `alt` (limited set).
    - `frontend/tests/components/ResponsiveImage.test.tsx`: assert `alt` forwarding.
  - **Step Dependencies**: None.
  - **Success Criteria**: All images have intentional `alt`; ResponsiveImage test passes.

## Tooling & Process

- [ ] **Step 12: Enforce a frontend bundle-size budget in CI**
  - **Task**: Address the open `MIGRATION-PLAN.md` item by adding a build-output size check to the
    frontend CI workflow (fail when the main JS/CSS chunk exceeds an agreed threshold). Start with a
    generous budget set from the current build to prevent regressions, not to force an immediate cut.
  - **Files**:
    - `.github/workflows/frontend-ci.yml`: add a size-budget step after `pnpm build`.
    - `frontend/package.json` (optional): a `size` script or config.
    - `MIGRATION-PLAN.md`: mark the performance-budget item as in place.
  - **Step Dependencies**: None.
  - **User Instructions**: Confirm the initial budget number against a fresh `pnpm build` before
    merging so the gate is realistic.
  - **Success Criteria**: CI fails on an artificial oversized bundle and passes on the current build.

## Logical Next Step

After Steps 1–4 land, re-measure `AdminDashboard.tsx`: if it is still doing heavy data-shaping,
extract a `useAdminDashboardData` selector hook (filtering/derivations like `isRegistrationInEdition`
and `layoutDayOptions`) so the component becomes purely presentational. Then expand the accessibility
work flagged in `MIGRATION-PLAN.md` (keyboard/screen-reader passes on the check-in and registration
flows) as a dedicated follow-up plan.
</content>
</invoke>
