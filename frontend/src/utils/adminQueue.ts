import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import type { AdminTableState } from "@/utils/adminTableState";

/** Which part of a queue is showing; an absent URL filter means the actionable default. */
export type QueueStatus = "unhandled" | "handled" | "all";

export interface QueuePage<T> {
  items: T[];
  total: number;
}

export function queueStatus(state: AdminTableState): QueueStatus {
  const value = state.filters.status;
  return value === "handled" || value === "all" ? value : "unhandled";
}

/** Server paging and filtering parameters; the server owns the totals. */
export function queueSearchParams(
  state: AdminTableState,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams({
    status: queueStatus(state),
    page: String(state.page + 1),
    limit: String(state.pageSize),
  });
  if (state.search) params.set("q", state.search);
  for (const [name, value] of Object.entries(extra)) if (value) params.set(name, value);
  return params.toString();
}

export async function fetchQueuePage<T>(
  path: string,
  query: string,
  headers: () => Record<string, string>,
  signal: AbortSignal,
  fallbackMessage: string,
  mapper: (item: Record<string, unknown>) => T,
): Promise<QueuePage<T>> {
  const body = await fetchJsonOrThrowWithUnauthorized<{ items?: unknown; total?: unknown }>(
    `${path}?${query}`,
    { headers: headers(), signal },
    fallbackMessage,
  );
  return {
    items: Array.isArray(body.items)
      ? body.items.map((item) => mapper(item as Record<string, unknown>))
      : [],
    total: Number(body.total ?? 0),
  };
}
