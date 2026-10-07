import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ColumnDef, RowData } from "@tanstack/react-table";
import { useAppTable, type AdminTableFeatures } from "@/hooks/useAdminTable";
import { readAdminTableState, type AdminTableState } from "@/utils/adminTableState";
import { loadColVis, saveColVis } from "@/utils/columnVisibility";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ConfirmModal from "@/components/ConfirmModal";
import { AdminSortableHeader } from "./AdminSortableHeader";
import { AdminTablePagination } from "./AdminTablePagination";
import { ColumnVisibilityDropdown } from "./ColumnVisibilityDropdown";

export interface AdminDataSourceResult<T> {
  data?: { items: T[]; total: number };
  filters?: readonly AdminTableFilter[];
  isFetching: boolean;
  isPlaceholderData?: boolean;
  isError?: boolean;
  refetch: () => unknown;
}
export interface AdminTableFilter {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
}
export interface AdminTableAction<T> {
  label: string;
  confirmation: string;
  run: (row: T) => Promise<void>;
}
export interface AdminDataTableProps<T extends RowData> {
  id: string;
  columns: ColumnDef<AdminTableFeatures, T, any>[];
  /** A stable custom hook, backed by Query with keepPreviousData and signal. */
  useDataSource: (state: AdminTableState) => AdminDataSourceResult<T>;
  filters?: readonly AdminTableFilter[];
  columnVisibilityKey: string;
  getRowId: (row: T) => string;
  getRowLabel: (row: T) => string;
  onOpen: (row: T) => void;
  /** Primary identifiers and status, independent of desktop column visibility. */
  renderCard: (row: T) => ReactNode;
  actions?: readonly AdminTableAction<T>[];
  primaryAction?: ReactNode;
  onSelectAllMatching?: (state: AdminTableState) => Promise<void>;
  onExport?: (state: AdminTableState) => Promise<void>;
  labels: {
    caption: string;
    search: string;
    sort: string;
    clear: string;
    loading: string;
    empty: string;
    error: string;
    retry: string;
    open: string;
    actions: string;
    export: string;
    selectAll: string;
    results: (total: number) => string;
  };
  debounceMs?: number;
}

/** Server-only table: never filters, sorts or slices the returned page. */
export function AdminDataTable<T extends RowData>(
  props:
    | AdminDataTableProps<T>
    | {
        table: Pick<
          ReturnType<typeof useAppTable<T>>,
          "getHeaderGroups" | "getRowModel" | "FlexRender"
        >;
      },
) {
  if ("table" in props) return <AdminControlledTable table={props.table} />;
  return <ServerAdminDataTable {...props} />;
}

/** Reuses the shared renderer while a domain retains its specialized toolbar and bulk controls. */
function AdminControlledTable<T extends RowData>({
  table,
  onOpen,
  getRowLabel,
  rowActions,
  caption,
  actionsLabel,
}: {
  onOpen?: (row: T) => void;
  getRowLabel?: (row: T) => string;
  rowActions?: (row: T) => ReactNode;
  caption?: string;
  actionsLabel?: string;
  table: Pick<ReturnType<typeof useAppTable<T>>, "getHeaderGroups" | "getRowModel" | "FlexRender">;
}) {
  return (
    <Table>
      {caption && <caption className="sr-only">{caption}</caption>}
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <AdminSortableHeader key={header.id} column={header.column}>
                <table.FlexRender header={header} />
              </AdminSortableHeader>
            ))}
            {rowActions && <th scope="col">{actionsLabel}</th>}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            tabIndex={onOpen ? 0 : undefined}
            aria-label={getRowLabel?.(row.original)}
            onKeyDown={(event) => {
              if (!onOpen || event.target !== event.currentTarget) return;
              if (event.key === "Enter") onOpen(row.original);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const sibling =
                  event.key === "ArrowDown"
                    ? event.currentTarget.nextElementSibling
                    : event.currentTarget.previousElementSibling;
                (sibling as HTMLElement | null)?.focus();
              }
            }}
            onClick={(event) => {
              if (!(event.target as HTMLElement).closest("button, a, input, [role=menuitem]"))
                onOpen?.(row.original);
            }}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id} className={cell.column.columnDef.meta?.tdClassName}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
            {rowActions && <TableCell>{rowActions(row.original)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ServerAdminDataTable<T extends RowData>({
  id,
  columns,
  useDataSource,
  filters: configuredFilters = [],
  columnVisibilityKey,
  getRowId,
  getRowLabel,
  onOpen,
  renderCard,
  actions = [],
  primaryAction,
  onSelectAllMatching,
  onExport,
  labels,
  debounceMs = 300,
}: AdminDataTableProps<T>) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const key = `table_${id}`;
  const state = readAdminTableState(search[key]);
  const update = (next: AdminTableState) =>
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({ ...previous, [key]: next }),
      replace: true,
    });
  const [searchDraft, setSearchDraft] = useState({ baseline: state.search, value: state.search });
  if (searchDraft.baseline !== state.search) {
    setSearchDraft({ baseline: state.search, value: state.search });
  }
  const draft = searchDraft.baseline === state.search ? searchDraft.value : state.search;
  const setDraft = (value: string) => setSearchDraft({ baseline: state.search, value });
  useEffect(() => {
    if (draft === state.search) return;
    const timer = setTimeout(() => update({ ...state, search: draft, page: 0 }), debounceMs);
    return () => clearTimeout(timer);
  });
  const [savedVisibility, setVisibility] = useState(() => loadColVis(columnVisibilityKey));
  const visibilityParam = search[`${key}_columns`];
  const visibility =
    visibilityParam &&
    typeof visibilityParam === "object" &&
    !Array.isArray(visibilityParam) &&
    Object.values(visibilityParam).every((value) => typeof value === "boolean")
      ? (visibilityParam as Record<string, boolean>)
      : savedVisibility;
  const result = useDataSource(state);
  const filters = result.filters ?? configuredFilters;
  const [action, setAction] = useState<{ action: AdminTableAction<T>; row: T } | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState(false);
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setOperationError(false);
    try {
      await operation();
    } catch {
      setOperationError(true);
    } finally {
      setBusy(false);
    }
  };
  const table = useAppTable(
    {
      data: result.data?.items ?? [],
      columns,
      getRowId,
      manualPagination: true,
      manualSorting: true,
      enableMultiSort: false,
      manualFiltering: true,
      rowCount: result.data?.total ?? 0,
      state: {
        pagination: { pageIndex: state.page, pageSize: state.pageSize },
        sorting: state.sort ? [{ id: state.sort, desc: state.sortDir === "desc" }] : [],
        globalFilter: state.search,
        columnVisibility: visibility,
      },
      onSortingChange: (updater) => {
        const current = state.sort ? [{ id: state.sort, desc: state.sortDir === "desc" }] : [];
        const next = typeof updater === "function" ? updater(current) : updater;
        update({
          ...state,
          page: 0,
          sort: next[0]?.id ?? "",
          sortDir: next[0]?.desc ? "desc" : "asc",
        });
      },
      onColumnVisibilityChange: (updater) => {
        const next = typeof updater === "function" ? updater(visibility) : updater;
        setVisibility(next);
        saveColVis(columnVisibilityKey, next);
        void navigate({
          to: ".",
          replace: true,
          search: (previous: Record<string, unknown>) => ({
            ...previous,
            [`${key}_columns`]: next,
          }),
        });
      },
    },
    (value) => ({ ...value }),
  );
  const rowActions = (row: T) => (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onOpen(row)}
        aria-label={`${labels.open}: ${getRowLabel(row)}`}
      >
        {labels.open}
      </Button>
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
            aria-label={`${labels.actions}: ${getRowLabel(row)}`}
          >
            {labels.actions}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {actions.map((item) => (
              <DropdownMenuItem key={item.label} onClick={() => setAction({ action: item, row })}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
  return (
    <section aria-label={labels.caption} aria-busy={result.isFetching} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span role="status">{labels.results(result.data?.total ?? 0)}</span>
        <Input
          className="w-full sm:w-auto"
          aria-label={labels.search}
          placeholder={labels.search}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {filters.map((filter) => (
          <Select
            key={filter.id}
            value={state.filters[filter.id] ?? ""}
            onValueChange={(value) => {
              const next = { ...state.filters };
              if (value) next[filter.id] = value;
              else delete next[filter.id];
              update({ ...state, filters: next, page: 0 });
            }}
          >
            <SelectTrigger aria-label={filter.label}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{filter.label}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <Button
          variant="outline"
          onClick={() => {
            setDraft("");
            update({ ...state, page: 0, search: "", filters: {} });
          }}
        >
          {labels.clear}
        </Button>
        <ColumnVisibilityDropdown table={table} tableId={id} />
        {primaryAction}
        {onSelectAllMatching && (
          <Button
            disabled={busy || result.isPlaceholderData || !result.data?.total}
            onClick={() => void perform(() => onSelectAllMatching(state))}
          >
            {labels.selectAll}
          </Button>
        )}
        {onExport && (
          <Button
            disabled={busy || result.isPlaceholderData || !result.data?.total}
            onClick={() => void perform(() => onExport(state))}
          >
            {labels.export}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(state.filters).map(([name, value]) => (
          <Button
            key={name}
            variant="secondary"
            size="sm"
            onClick={() => {
              const next = { ...state.filters };
              delete next[name];
              update({ ...state, page: 0, filters: next });
            }}
          >
            {filters.find((filter) => filter.id === name)?.label ?? name}:{" "}
            {filters
              .find((filter) => filter.id === name)
              ?.options.find((option) => option.value === value)?.label ?? value}{" "}
            ×
          </Button>
        ))}
      </div>
      {result.isFetching && <p role="status">{labels.loading}</p>}
      {(result.isError || operationError) && (
        <div role="alert">
          {labels.error}{" "}
          {result.isError && <Button onClick={() => result.refetch()}>{labels.retry}</Button>}
        </div>
      )}
      {result.data && result.data.items.length === 0 && <p>{labels.empty}</p>}
      <div className="hidden md:block">
        <AdminControlledTable
          table={table}
          onOpen={onOpen}
          getRowLabel={getRowLabel}
          rowActions={rowActions}
          caption={labels.caption}
          actionsLabel={labels.actions}
        />
      </div>
      <div className="flex flex-wrap gap-2 md:hidden" aria-label={labels.sort}>
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanSort())
          .map((column) => (
            <Button
              key={column.id}
              variant="outline"
              size="sm"
              aria-pressed={Boolean(column.getIsSorted())}
              onClick={column.getToggleSortingHandler()}
            >
              {labels.sort}:{" "}
              {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
              {column.getIsSorted() === "desc" ? " ↓" : column.getIsSorted() === "asc" ? " ↑" : ""}
            </Button>
          ))}
      </div>
      <ul className="space-y-2 md:hidden">
        {table.getRowModel().rows.map((row) => (
          <li key={row.id} className="space-y-2 rounded-md border border-border p-3 break-words">
            {renderCard(row.original)}
            {row
              .getVisibleCells()
              .filter((cell) => cell.column.id === "actions")
              .map((cell) => (
                <div key={cell.id}>
                  <table.FlexRender cell={cell} />
                </div>
              ))}
            {rowActions(row.original)}
          </li>
        ))}
      </ul>
      <AdminTablePagination
        total={result.data?.total ?? 0}
        pageIndex={state.page}
        pageSize={state.pageSize}
        canPreviousPage={state.page > 0 && !result.isPlaceholderData}
        canNextPage={
          !result.isPlaceholderData && (state.page + 1) * state.pageSize < (result.data?.total ?? 0)
        }
        onPreviousPage={() => update({ ...state, page: Math.max(0, state.page - 1) })}
        onNextPage={() => update({ ...state, page: state.page + 1 })}
        onPageSizeChange={(pageSize) => update({ ...state, page: 0, pageSize })}
      />
      {action && (
        <ConfirmModal
          admin
          show
          title={action.action.label}
          body={action.action.confirmation}
          errorFallback={labels.error}
          onHide={() => setAction(null)}
          onConfirm={() => action.action.run(action.row)}
        />
      )}
    </section>
  );
}
