import {
  createTableHook,
  tableFeatures,
  columnVisibilityFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  createFilteredRowModel,
  createSortedRowModel,
  createPaginatedRowModel,
  filterFns,
  sortFns,
} from "@tanstack/react-table";

export const { useAppTable, createAppColumnHelper, appFeatures } = createTableHook({
  features: tableFeatures({
    columnVisibilityFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    rowSortingFeature,
    rowPaginationFeature,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    filterFns,
    sortFns,
  }),
  // RegistrationList already paginates server-side, so its table must keep
  // getRowModel() returning every row it fetched — not a client-sliced page.
  // Tables that want TanStack's client-side pagination (People/Volunteers/
  // Members) opt in per-instance with manualPagination: false.
  manualPagination: true,
});

export type AdminTableFeatures = typeof appFeatures;
