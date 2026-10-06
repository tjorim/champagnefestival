export interface AdminTableState {
  page: number;
  pageSize: number;
  sort: string;
  sortDir: "asc" | "desc";
  search: string;
  filters: Record<string, string>;
}

/** Namespaced search state preserves other admin views and unrelated deep links. */
export function readAdminTableState(value: unknown): AdminTableState {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const integer = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  return {
    page: integer(input.page, 0, 0, Number.MAX_SAFE_INTEGER),
    pageSize: integer(input.pageSize, 20, 1, 100),
    sort: typeof input.sort === "string" ? input.sort : "",
    sortDir: input.sortDir === "desc" ? "desc" : "asc",
    search: typeof input.search === "string" ? input.search : "",
    filters:
      input.filters && typeof input.filters === "object" && !Array.isArray(input.filters)
        ? Object.fromEntries(
            Object.entries(input.filters).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
            ),
          )
        : {},
  };
}

export function validateAdminSearch(search: Record<string, unknown>) {
  return search;
}
