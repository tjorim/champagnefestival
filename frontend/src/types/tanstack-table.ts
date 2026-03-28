import {
  createTableHook,
  tableFeatures,
  globalFilteringFeature,
  rowSortingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  sortFns,
  type TableFeatures,
  type RowData,
  type CellData,
} from "@tanstack/react-table";

// Extend TanStack column meta to carry td/th className for responsive hiding
declare module "@tanstack/table-core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue extends CellData = CellData,
  > {
    tdClassName?: string;
  }
}

export const {
  useAppTable,
  createAppColumnHelper,
  appFeatures,
} = createTableHook({
  _features: tableFeatures({ globalFilteringFeature, rowSortingFeature }),
  _rowModels: {
    filteredRowModel: createFilteredRowModel(filterFns),
    sortedRowModel: createSortedRowModel(sortFns),
  },
});

export type AdminTableFeatures = typeof appFeatures;
