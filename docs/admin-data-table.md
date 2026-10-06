# Shared server-driven admin table (#1180)

`AdminDataTable` owns pagination, sorting, debounced search, filters and column
visibility. No screens have been migrated; that remains #1181/#1182.

Supply column definitions, filter definitions and a stable `useDataSource` hook
returning the Query result (`data: { items, total }`, `isFetching`,
`isPlaceholderData`, `isError`, `refetch`). Its query key must include every input
field, use `placeholderData: keepPreviousData`, and pass the query's `signal` to
the request. The component enables all three manual flags; returned rows are
never sorted, filtered or sliced in the browser. Total comes from the same response.

The admin route preserves search parameters. Each table owns `table_<id>`, a
JSON search object containing zero-based `page`, `pageSize` (1–100), `sort`,
`sortDir`, `search`, and string-valued `filters`. Invalid state receives safe
defaults. Sort/search/filter/page-size changes reset the page; data refreshes
never modify the URL. Updates replace history and preserve unrelated parameters.

Pass the existing column visibility storage key unchanged: the format is still
`loadColVis`/`saveColVis`, including their malformed/unavailable-storage fallback.
Shared column overrides round-trip in `table_<id>_columns`; absent overrides use
the stored preference. Unknown saved column IDs are retained harmlessly; new columns are visible.

Supply translated labels, `getRowLabel`, `onOpen`, and a concise `renderCard`
containing identifiers and status. Desktop rows support Enter and arrow-key
navigation; labelled record buttons and overflow menus remain reachable by Tab.
Mobile cards retain their identifiers independently of hidden desktop columns.
All exceptional actions require a confirmation and use the existing pending/error
dialog. Caller-owned primary actions can be supplied as a toolbar node.

`onSelectAllMatching` and `onExport` receive the entire matching state, not page
rows. Adapters must call their server paths (and own any selection model), never
collect the displayed page. These controls are disabled on placeholder data.
Callbacks run once per activation with pending and error feedback; no automatic
write retries are made. Row-action retry safety belongs to the supplied operation.
