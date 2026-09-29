# Admin table migration (#1106)

The admin tables use the generated shadcn Table primitives and Base UI buttons,
selects, checkboxes and menus. TanStack Table v9 and `useAdminTable` retain their
existing data, filtering, sorting, selection and pagination responsibilities.
People, Volunteers and Members paginate in the browser; Registrations and the
ledger continue fetching pages from the server. Column visibility continues to
use the existing persisted storage contract.

`AdminSortableHeader` puts the sorting action on a native button and keeps
`aria-sort` on the column header. Responsive secondary columns use prefixed
Tailwind breakpoint utilities on both headers and cells. Table containers own
horizontal overflow. Menu and select portals carry `AdminThemeScope`; the
ledger modal also carries the fixed-dark token scope.

AuditLogViewer and AnalyticsDashboard remain plain presentation tables: neither
needs client sorting, selection or a second pagination model. VenueManagement
no longer contains the raw table mentioned in the original issue, so it needs
no conversion at this revision.

No API writes or retry behaviour change. Existing row actions continue to use
their documented mutation paths.

Browser coverage in `admin-tables.authenticated.spec.ts` checks keyboard sorting,
selection, persisted visibility, dark menu tokens and mobile columns. Review
screenshots of People (client paging) and Registrations (server paging) are
captured separately for the eventual PR; this change does not create a PR.
