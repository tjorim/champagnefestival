// Extend TanStack column meta to carry td/th className for responsive hiding
import type { TableFeatures, RowData, CellData } from "@tanstack/table-core";

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
