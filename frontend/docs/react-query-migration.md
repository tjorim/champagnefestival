# React Query migration notes

## Implemented in Issue 3

The frontend now relies on TanStack Query for the first shared server-state flows instead of local fetch lifecycle code:

- `useActiveEdition` uses a dedicated query options factory for `/api/editions/active`.
- `main.tsx` derives reservable events from query-backed edition data with `useMemo`, rather than copying query data into additional component state.
- `RegistrationCreateModal` uses TanStack Query for:
  - active-edition event lookup,
  - debounced people search,
  - registration creation mutation invalidation.

Current cache policy for the migrated flows:

- Active edition: `staleTime` 5 minutes, `retry: false`.
- Admin reservable events: `staleTime` 1 minute, `retry: false`.
- Admin people search: `staleTime` 30 seconds, `retry: false`.

## Follow-up migration path

The next raw-fetch candidates should be migrated in this order:

1. `AdminDashboard.tsx`
   - largest concentration of server-state,
   - already performs coordinated refreshes after admin mutations,
   - would benefit most from shared query keys and targeted invalidation.
2. `ContentManagement.tsx`
   - server-backed CRUD with multiple local loading/error branches,
   - good fit for `useQuery` + `useMutation`.
3. `ItemModal.tsx` and other admin lookup modals
   - repeats searchable lookup behavior similar to `RegistrationCreateModal`.
4. public-side request flows (`RegistrationModal`, `MyRegistrationsPage`, `CheckInPage`, `ContactForm`)
   - can migrate after the admin query-key conventions are stable.

## Suggested conventions for follow-up work

- Keep query keys centralized per domain (`edition`, `registrations`, `people`, etc.).
- Prefer `select` and derived `useMemo` values over copying query data into local state.
- Use `useMutation` for writes and invalidate only the affected query families.
- Avoid silent fetch fallbacks; keep retry/staleness behavior explicit in query options.
