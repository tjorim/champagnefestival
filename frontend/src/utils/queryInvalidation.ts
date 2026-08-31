import type { QueryClient, QueryKey } from "@tanstack/react-query";

export function removeAuthenticatedQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] === "admin" || query.queryKey[0] === "venue-plan",
  });
}

export function invalidateAdmin(
  queryClient: QueryClient,
  keys: readonly QueryKey[],
): Promise<void> {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(
    () => {},
  );
}
