import {
  createTableHook,
  tableFeatures,
  columnVisibilityFeature,
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
  _features: tableFeatures({ columnVisibilityFeature, globalFilteringFeature, rowSortingFeature }),
  _rowModels: {
    filteredRowModel: createFilteredRowModel(filterFns),
    sortedRowModel: createSortedRowModel(sortFns),
  },
});

export type AdminTableFeatures = typeof appFeatures;
