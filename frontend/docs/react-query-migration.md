# React Query migration notes

## Completed migration coverage

The TanStack Query migration from the original Issue 3 notes has now been completed for the planned follow-up surfaces:

- `useActiveEdition` uses a dedicated query options factory for `/api/editions/active`.
- `main.tsx` derives registrable events and schedule data from query-backed edition data with `useMemo`, rather than copying query data into additional component state.
- `RegistrationCreateModal.tsx` uses TanStack Query for:
  - active-edition event lookup,
  - debounced people search,
  - registration creation mutation invalidation.
- `AdminDashboard.tsx` now loads its server-state through TanStack Query and clears dashboard cache on logout.
- `ContentManagement.tsx` now uses query-backed section loads and mutations for CRUD flows.
- `ItemModal.tsx` and related admin lookup flows now use TanStack Query for debounced people search.
- Public-side request flows now use TanStack Query where planned:
  - `RegistrationModal.tsx` for submission,
  - `MyRegistrationsPage.tsx` for lookup request + token-backed access,
  - `CheckInPage.tsx` for lookup + check-in mutation,
  - `ContactForm.tsx` for submission.

## Current cache policy

- Active edition: `staleTime` 5 minutes, `retry: false`.
- Admin reservable events: `staleTime` 1 minute, `retry: false`.
- Admin people search: `staleTime` 30 seconds, `retry: false`.
- Content-management sections: `staleTime` 1 minute, `retry: false`.
- Public lookup/check-in flows: `staleTime` 30 seconds, `retry: false`.

## Follow-up notes after migration

The original migration checklist is complete, but there is still room for incremental cleanup:

1. Continue moving shared fetch helpers out of component files where reuse becomes valuable.
2. Add more shared query-key helpers when new query-backed domains are introduced.
3. Keep invalidation scoped to the affected domain families as more admin mutations migrate.

## Conventions in use

- Query keys are centralized in `src/utils/queryKeys.ts` for the migrated shared domains.
- Derived values continue to prefer `useMemo` over copying query results into extra state.
- Mutations keep `retry: false` explicit and invalidate or update only affected caches.
- Fallback behavior remains explicit rather than relying on silent fetch retries.
