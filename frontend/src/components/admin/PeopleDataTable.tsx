import { captureAdminPeopleFence } from "@/state/adminPeopleSession";
import { useCallback, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useIsMutating } from "@tanstack/react-query";
import { AdminDataTable } from "./AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { AdminTableFeatures } from "@/hooks/useAdminTable";
import { usePeopleCountsQuery, usePeopleListQuery } from "@/hooks/usePeopleListQuery";
import type { AdminTableState } from "@/utils/adminTableState";
import {
  fetchPeoplePage,
  peopleListSearchParams,
  type PeopleListParams,
} from "@/utils/adminPeopleQueries";
import { downloadFileOrThrow } from "@/utils/adminApi";
import type { Person } from "@/types/person";
import { m } from "@/paraglide/messages";

export function peopleTableParams(state: AdminTableState, role?: string): PeopleListParams {
  const sorts: Record<string, PeopleListParams["sort"]> = {
    name: "name",
    email: "email",
    registrations: "registration_count",
    createdAt: "created",
    updatedAt: "updated",
  };
  const sort = state.sort && Object.hasOwn(sorts, state.sort) ? sorts[state.sort] : undefined;
  return {
    page: state.page + 1,
    limit: state.pageSize,
    q: state.search || undefined,
    sort,
    sort_dir: state.sortDir,
    role: role ?? state.filters.role,
    active:
      state.filters.active === "active"
        ? true
        : state.filters.active === "inactive"
          ? false
          : undefined,
  };
}

function peopleEndpointParams(state: AdminTableState, role?: string): PeopleListParams {
  const params = peopleTableParams(state, role);
  return params.role === "volunteer" &&
    (params.sort === "email" || params.sort === "registration_count")
    ? { ...params, sort: undefined }
    : params;
}

export function PersonName({ person }: { person: Person }) {
  const pending = useIsMutating({
    mutationKey: ["admin", "people", "write"],
    predicate: (mutation) => {
      const context = mutation.state.context as { current?: () => boolean } | undefined;
      if (context?.current && !context.current()) return false;
      const variables = mutation.state.variables;
      return typeof variables === "string"
        ? variables === person.id
        : (variables as { id?: string } | undefined)?.id === person.id;
    },
  });
  return (
    <span className="flex items-center gap-1" aria-busy={pending > 0}>
      {person.name}
      {!person.active && <Badge variant="secondary">{m.admin_people_inactive_badge_label()}</Badge>}
      {pending > 0 && <Spinner size="sm" label={m.admin_settings_saving()} />}
    </span>
  );
}

interface Props {
  id: "people" | "members" | "volunteers";
  authHeaders: () => Record<string, string>;
  columns: ColumnDef<AdminTableFeatures, Person, any>[];
  onOpen: (person: Person) => void;
  primaryAction: ReactNode;
}

export function PeopleDataTable({ id, authHeaders, columns, onOpen, primaryAction }: Props) {
  const role = id === "members" ? "member" : id === "volunteers" ? "volunteer" : undefined;
  const useDataSource = useCallback(
    function useDataSource(state: AdminTableState) {
      const params = peopleEndpointParams(state, role);
      const query = usePeopleListQuery(params, authHeaders);
      const activeCounts = usePeopleCountsQuery({ q: params.q, role: params.role }, authHeaders);
      const roleCounts = usePeopleCountsQuery(
        { q: params.q, active: params.active },
        authHeaders,
        !role,
      );
      return {
        ...query,
        filters: [
          {
            id: "active",
            label: m.admin_people_active_label(),
            options: [
              {
                value: "active",
                label: `${m.admin_members_filter_active()} (${activeCounts.data?.active ?? 0})`,
              },
              {
                value: "inactive",
                label: `${m.admin_members_filter_inactive()} (${activeCounts.data?.inactive ?? 0})`,
              },
            ],
          },
          ...(!role
            ? [
                {
                  id: "role",
                  label: m.admin_people_roles_label(),
                  options: Object.entries(roleCounts.data?.by_role ?? {}).map(([value, count]) => ({
                    value,
                    label: `${value} (${count})`,
                  })),
                },
              ]
            : []),
        ],
      };
    },
    [authHeaders, role],
  );
  return (
    <AdminDataTable
      id={id}
      columns={columns}
      useDataSource={useDataSource}
      columnVisibilityKey={`admin-col-vis-${id}`}
      getRowId={(person) => person.id}
      getRowLabel={(person) => person.name}
      onOpen={onOpen}
      renderCard={(person) => (
        <>
          <PersonName person={person} />
          <p>{person.email || person.address}</p>
        </>
      )}
      primaryAction={primaryAction}
      onSelectAllMatching={
        id === "people"
          ? async (state) => {
              const current = captureAdminPeopleFence();
              const params = { ...peopleEndpointParams(state, role), limit: 100, page: 1 };
              const emails = new Set<string>();
              const signal = new AbortController().signal;
              let total = Infinity;
              // Full matching emails are fetched only for this explicit user action.
              for (let offset = 0; offset < total; offset += params.limit) {
                if (!current()) return;
                const page = await fetchPeoplePage(authHeaders, params, signal);
                if (!current()) return;
                total = page.total;
                for (const person of page.items) if (person.email) emails.add(person.email);
                params.page += 1;
              }
              if (current()) await navigator.clipboard.writeText(Array.from(emails).join(", "));
            }
          : undefined
      }
      onExport={async (state) => {
        const params = peopleListSearchParams(peopleEndpointParams(state, role));
        params.delete("page");
        params.delete("limit");
        if (role === "volunteer") {
          params.delete("role");
          params.set("include_inactive", "true");
        }
        await downloadFileOrThrow(
          `/api/${role === "volunteer" ? "volunteers" : "people"}/export?${params}`,
          { headers: authHeaders() },
          m.admin_error_load_data(),
          `${id}.csv`,
        );
      }}
      labels={{
        caption:
          id === "members"
            ? m.admin_members_table_caption()
            : id === "volunteers"
              ? m.admin_volunteers_table_caption()
              : m.admin_people_tab(),
        search: m.admin_search_person_placeholder(),
        sort: m.admin_table_sort(),
        clear: m.admin_content_clear_filters(),
        loading: m.admin_loading(),
        empty: m.admin_people_no_results(),
        error: m.admin_error_load_data(),
        retry: m.admin_retry(),
        open: m.admin_edit(),
        actions: m.admin_actions_label(),
        export: m.admin_export_csv(),
        selectAll: m.admin_people_copy_emails_tooltip(),
        results: (total) => m.admin_table_results({ total }),
      }}
    />
  );
}
