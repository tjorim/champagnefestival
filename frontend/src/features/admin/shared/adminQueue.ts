import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import type { AdminTableState } from "./adminTableState";

/** Which part of a queue is showing; an absent URL filter means the actionable default. */
export type QueueStatus = "unhandled" | "handled" | "all";

export type QueuePage<T> = Omit<import("@/api-types").ContactMessageListEnvelope, "items"> & {
  items: T[];
};

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
  signal: AbortSignal,
  fallbackMessage: string,
): Promise<QueuePage<T>> {
  return fetchJsonOrThrow<QueuePage<T>>(`${path}?${query}`, { signal }, fallbackMessage);
}
