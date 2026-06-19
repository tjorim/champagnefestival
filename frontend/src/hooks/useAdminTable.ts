import {
  createTableHook,
  tableFeatures,
  columnVisibilityFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  sortFns,
} from "@tanstack/react-table";

export const {
  useAppTable,
  createAppColumnHelper,
  appFeatures,
} = createTableHook({
  features: tableFeatures({
    columnVisibilityFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    rowSortingFeature,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    filterFns,
    sortFns,
  }),
});

export type AdminTableFeatures = typeof appFeatures;
