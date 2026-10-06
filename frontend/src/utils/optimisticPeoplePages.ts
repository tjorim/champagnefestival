import type { Query, QueryClient } from "@tanstack/react-query";
import type { Person } from "@/types/person";
import type { PeopleListParams, PeoplePage } from "@/utils/adminPeopleQueries";
import { queryKeys } from "@/utils/queryKeys";

export interface PeopleWrite {
  id: string;
  update: (person: Person) => Person | null;
}
interface Operation {
  write: PeopleWrite;
  current: () => boolean;
  reconciling: boolean;
}
interface Snapshot {
  query: Query;
  data: PeoplePage;
}

/** Existing rows change immediately; server queries refill and reorder pages. */
export function patchPeoplePage(
  page: PeoplePage,
  params: PeopleListParams,
  write: PeopleWrite,
  source?: Person,
): PeoplePage {
  const person = page.items.find((item) => item.id === write.id) ?? source;
  if (!person) return page;
  const matches = (row: Person | null) =>
    !!row &&
    (!params.role || row.roles.includes(params.role)) &&
    (params.active === undefined || row.active === params.active);
  const updated = write.update(person);
  const leaves = matches(person) && !matches(updated);
  return {
    ...page,
    items: page.items.flatMap((item) =>
      item.id !== write.id ? [item] : matches(updated) ? [updated!] : [],
    ),
    total: Math.max(0, page.total - (leaves ? 1 : 0)),
  };
}

class PeopleWrites {
  private snapshots = new Map<Query, Snapshot>();
  private operations = new Set<Operation>();
  private unsubscribe?: () => void;
  private writing = false;
  private settlement: Promise<void> = Promise.resolve();
  private requests = new Map<string, Promise<unknown>>();
  private client: QueryClient;
  constructor(client: QueryClient) {
    this.client = client;
  }

  // PUT/DELETE for the same person persist in invocation order, even across
  // member and volunteer forms. Different people can still persist concurrently.
  async persist<T>(id: string, current: () => boolean, request: () => Promise<T>): Promise<T> {
    const previous = this.requests.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => {
        if (!current()) throw new Error("People session changed");
        return request();
      });
    this.requests.set(id, next);
    try {
      return await next;
    } finally {
      if (this.requests.get(id) === next) this.requests.delete(id);
    }
  }

  async begin(write: PeopleWrite, current: () => boolean): Promise<Operation> {
    const operation = { write, current, reconciling: false };
    await this.client.cancelQueries({ queryKey: queryKeys.admin.peopleLists });
    if (!current()) return operation;
    for (const query of this.client
      .getQueryCache()
      .findAll({ queryKey: queryKeys.admin.peopleLists })) {
      if (query.state.data && !this.snapshots.has(query))
        this.snapshots.set(query, { query, data: query.state.data as PeoplePage });
    }
    this.operations.add(operation);
    this.unsubscribe ??= this.client.getQueryCache().subscribe((event) => {
      if (
        this.writing ||
        event.type !== "updated" ||
        event.action.type !== "success" ||
        event.action.manual
      )
        return;
      if (!queryKeys.admin.peopleLists.every((part, index) => event.query.queryKey[index] === part))
        return;
      let snapshot = this.snapshots.get(event.query);
      if (!snapshot) {
        snapshot = { query: event.query, data: event.query.state.data as PeoplePage };
        this.snapshots.set(event.query, snapshot);
      }
      snapshot.data = event.query.state.data as PeoplePage;
      this.render();
    });
    this.render();
    return operation;
  }

  settle(operation: Operation, success: boolean): Promise<void> {
    const next = this.settlement.then(async () => {
      if (!this.operations.has(operation)) return;
      operation.reconciling = true;
      if (operation.current()) {
        // Keep a successful write visible if reconciliation cannot reach the server.
        if (success) this.patchSnapshots(operation.write);
        // Refetch before rolling back a refusal/ambiguous result. A successful
        // refetch replaces the snapshot; a failed one keeps the original data.
        await this.client
          .refetchQueries({ queryKey: queryKeys.admin.peopleLists, type: "all" })
          .catch(() => undefined);
      }
      this.operations.delete(operation);
      if (operation.current()) this.render();
      if (!this.operations.size) {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.snapshots.clear();
      }
    });
    this.settlement = next.catch(() => undefined);
    return next;
  }

  private sourceFor(id: string, params: PeopleListParams) {
    const search = params.q?.trim().toLowerCase();
    // Search membership is known only from a server result for that search.
    // A person found in another search must not lower this query's total.
    return Array.from(this.snapshots.values())
      .filter(
        ({ query }) =>
          !search || (query.queryKey[3] as PeopleListParams).q?.trim().toLowerCase() === search,
      )
      .flatMap(({ data }) => data.items)
      .find((person) => person.id === id);
  }
  private patchSnapshots(write: PeopleWrite) {
    const sources = new Map(
      Array.from(this.snapshots.values(), ({ query }) => [
        query,
        this.sourceFor(write.id, query.queryKey[3] as PeopleListParams),
      ]),
    );
    for (const snapshot of this.snapshots.values()) {
      snapshot.data = patchPeoplePage(
        snapshot.data,
        snapshot.query.queryKey[3] as PeopleListParams,
        write,
        sources.get(snapshot.query),
      );
    }
  }
  private render() {
    this.writing = true;
    try {
      for (const { query, data } of this.snapshots.values()) {
        // A removed query, even when its key is reused by the next session, is
        // never recreated or patched by a late callback.
        if (this.client.getQueryCache().get(query.queryHash) !== query) continue;
        let next = data;
        const grouped = new Map<string, PeopleWrite[]>();
        for (const operation of this.operations) {
          if (!operation.current() || operation.reconciling) continue;
          const list = grouped.get(operation.write.id) ?? [];
          list.push(operation.write);
          grouped.set(operation.write.id, list);
        }
        for (const [id, changes] of grouped) {
          const source = this.sourceFor(id, query.queryKey[3] as PeopleListParams);
          const write: PeopleWrite = {
            id,
            update: (person) => {
              let updated: Person | null = person;
              for (const change of changes) if (updated) updated = change.update(updated);
              return updated;
            },
          };
          next = patchPeoplePage(next, query.queryKey[3] as PeopleListParams, write, source);
        }
        this.client.setQueryData(query.queryKey, next);
      }
    } finally {
      this.writing = false;
    }
  }
}
const clients = new WeakMap<QueryClient, PeopleWrites>();
export function peopleWrites(client: QueryClient) {
  let writes = clients.get(client);
  if (!writes) {
    writes = new PeopleWrites(client);
    clients.set(client, writes);
  }
  return writes;
}
