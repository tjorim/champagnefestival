// Extend TanStack column meta to carry td/th className for responsive hiding
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    tdClassName?: string;
  }
}
