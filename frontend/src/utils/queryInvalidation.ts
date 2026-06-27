import type { QueryClient, QueryKey } from "@tanstack/react-query";

export function invalidateAdmin(
  queryClient: QueryClient,
  keys: readonly QueryKey[],
): Promise<void> {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(
    () => {},
  );
}
