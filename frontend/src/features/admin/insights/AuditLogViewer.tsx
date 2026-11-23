import { ActorName, actorName } from "@/components/admin/ActorName";
import { getLocale } from "@/paraglide/runtime";
import { formatDateTime } from "@/lib/format/dateUtils";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
  AdminInput,
} from "@/components/admin/AdminFields";
/**
 * AuditLogViewer — read-only browser for the operational audit trail.
 *
 * Every admin create/update/delete mutation writes an AuditEntry server-side
 * (see backend/app/services/audit_service.py). This is the first UI surface that reads it back —
 * previously the only way to see who did what was a direct DB query.
 */

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";

import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { m } from "@/paraglide/messages";
import { auditRecordHref } from "../shared/auditRecordLink";
import {
  fetchAuditActions,
  fetchAuditActors,
  fetchAuditEntries,
  fetchAuditResourceTypes,
} from "@/lib/api/adminFetch";
import { queryKeys } from "@/lib/query/queryKeys";
import { devError } from "@/lib/devLog";

const PAGE_SIZE = 50;

function readableLabel(value: string) {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toLocaleUpperCase(getLocale()) + words.slice(1);
}

function resourceLabel(type: string): string {
  switch (type) {
    case "event":
      return m.admin_audit_resource_event();
    case "edition":
      return m.admin_audit_resource_edition();
    case "organization":
      return m.admin_audit_resource_organization();
    case "registration":
      return m.admin_audit_resource_registration();
    case "room":
      return m.admin_audit_resource_room();
    case "table":
      return m.admin_audit_resource_table();
    case "table_type":
      return m.admin_audit_resource_table_type();
    case "venue":
      return m.admin_audit_resource_venue();
    case "person":
      return m.admin_person_label();
    default:
      return readableLabel(type);
  }
}

function actionLabel(action: string): string {
  if (action === "check_in") return m.admin_audit_action_check_in();
  if (action === "person_merged") return m.admin_audit_action_person_merged();
  const [, resource, verb] =
    /^(?:(.+)_)?(create|created|update|updated|delete|deleted)$/.exec(action) ?? [];
  if (!verb) return readableLabel(action);
  const label = verb.startsWith("creat")
    ? m.admin_audit_action_created()
    : verb.startsWith("updat")
      ? m.admin_audit_action_updated()
      : m.admin_audit_action_deleted();
  return resource ? `${label} · ${resourceLabel(resource)}` : label;
}

function formatTimestamp(iso: string): string {
  return formatDateTime(iso, getLocale());
}

export default function AuditLogViewer() {
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [page, setPage] = useState(1);

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.admin.auditResourceTypes,
    queryFn: () => fetchAuditResourceTypes(),
    staleTime: 60 * 1000,
  });

  const actorsQuery = useQuery({
    queryKey: queryKeys.admin.auditActors,
    queryFn: () => fetchAuditActors(),
    staleTime: 60 * 1000,
  });

  const actionsQuery = useQuery({
    queryKey: queryKeys.admin.auditActions,
    queryFn: () => fetchAuditActions(),
    staleTime: 60 * 1000,
  });

  const entriesQuery = useQuery({
    queryKey: queryKeys.admin.auditEntries({
      resourceType,
      resourceId,
      actor,
      action,
      since,
      until,
      page,
    }),
    queryFn: () =>
      fetchAuditEntries({
        resourceType: resourceType || undefined,
        resourceId: resourceId.trim() || undefined,
        actor: actor.trim() || undefined,
        action: action.trim() || undefined,
        // The API takes timestamps; a bare date means the whole local day.
        since: since ? new Date(`${since}T00:00:00`).toISOString() : undefined,
        until: until ? new Date(`${until}T23:59:59.999`).toISOString() : undefined,
        limit: PAGE_SIZE,
        page,
      }),
    staleTime: 10 * 1000,
  });

  const handleResourceTypeChange = useCallback((value: string) => {
    setResourceType(value);
    setPage(1);
  }, []);

  const handleResourceIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setResourceId(e.target.value);
    setPage(1);
  }, []);

  const handleActorChange = useCallback((value: string) => {
    setActor(value);
    setPage(1);
  }, []);

  const handleActionChange = useCallback((value: string) => {
    setAction(value);
    setPage(1);
  }, []);

  const handleSinceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSince(e.target.value);
    setPage(1);
  }, []);

  const handleUntilChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUntil(e.target.value);
    setPage(1);
  }, []);

  const hasFilters = Boolean(resourceType || resourceId || actor || action || since || until);

  const handleClearFilters = useCallback(() => {
    setResourceType("");
    setResourceId("");
    setActor("");
    setAction("");
    setSince("");
    setUntil("");
    setPage(1);
  }, []);

  const entries = entriesQuery.data ?? [];
  const actorOptions = (actorsQuery.data ?? []).map((option) => ({
    actor: option.actor,
    name: actorName(option.actor_label),
  }));
  const actorNameCounts = new Map<string, number>();
  for (const { name } of actorOptions) {
    actorNameCounts.set(name, (actorNameCounts.get(name) ?? 0) + 1);
  }

  if (entriesQuery.error) {
    devError("Failed to load audit log", entriesQuery.error);
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-medium leading-tight mb-0">{m.admin_audit_log_title()}</h2>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 mb-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminField controlId="audit-resource-type">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_audit_filter_resource_type()}
            </AdminLabel>
            <AdminSelect size="sm" value={resourceType} onValueChange={handleResourceTypeChange}>
              <AdminOption value="">{m.admin_audit_filter_all()}</AdminOption>
              {(resourceTypesQuery.data ?? []).map((type) => (
                <AdminOption key={type} value={type}>
                  {resourceLabel(type)}
                </AdminOption>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField controlId="audit-resource-id">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_audit_filter_resource_id()}
            </AdminLabel>
            <AdminInput
              size="sm"
              type="text"
              value={resourceId}
              onChange={handleResourceIdChange}
              placeholder={m.admin_audit_filter_resource_id_placeholder()}
            />
          </AdminField>
          <AdminField controlId="audit-actor">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_audit_filter_actor()}
            </AdminLabel>
            <AdminSelect size="sm" value={actor} onValueChange={handleActorChange}>
              <AdminOption value="">{m.admin_audit_filter_all()}</AdminOption>
              {actorOptions.map(({ actor, name }) => (
                <AdminOption key={actor} value={actor}>
                  {actorNameCounts.get(name) === 1 ? name : `${name} (${actor})`}
                </AdminOption>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField controlId="audit-action">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_audit_filter_action()}
            </AdminLabel>
            <AdminSelect size="sm" value={action} onValueChange={handleActionChange}>
              <AdminOption value="">{m.admin_audit_filter_all()}</AdminOption>
              {(actionsQuery.data ?? []).map((value) => (
                <AdminOption key={value} value={value}>
                  {actionLabel(value)}
                </AdminOption>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField controlId="audit-since">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_audit_filter_since()}
            </AdminLabel>
            <AdminInput size="sm" type="date" value={since} onChange={handleSinceChange} />
          </AdminField>
          <AdminField controlId="audit-until">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_audit_filter_until()}
            </AdminLabel>
            <AdminInput size="sm" type="date" value={until} onChange={handleUntilChange} />
          </AdminField>
          {hasFilters && (
            <AdminField className="sm:self-end">
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                {m.admin_content_clear_filters()}
              </Button>
            </AdminField>
          )}
        </form>

        {(entriesQuery.error || resourceTypesQuery.error || actionsQuery.error) && (
          <Alert variant="danger" className="mb-4">
            {m.admin_error_load_data()}
          </Alert>
        )}

        {entriesQuery.isPending ? (
          <div className="text-center py-12">
            <Spinner variant="primary" role="status">
              <span className="sr-only">{m.admin_loading()}</span>
            </Spinner>
          </div>
        ) : entries.length === 0 ? (
          <AdminEmptyState>{m.admin_audit_no_entries()}</AdminEmptyState>
        ) : (
          <>
            <Table>
              <caption className="sr-only">{m.admin_audit_table_caption()}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{m.admin_audit_column_timestamp()}</TableHead>
                  <TableHead scope="col">{m.admin_audit_column_actor()}</TableHead>
                  <TableHead scope="col">{m.admin_audit_column_action()}</TableHead>
                  <TableHead scope="col">{m.admin_audit_column_resource()}</TableHead>
                  <TableHead scope="col">{m.admin_audit_column_details()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const typeLabel = resourceLabel(entry.resource_type);
                  const href = entry.resource_exists
                    ? auditRecordHref(entry.resource_type, entry.resource_id)
                    : undefined;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>{formatTimestamp(entry.timestamp)}</TableCell>
                      <TableCell className="break-words">
                        <ActorName actor={entry.actor} label={entry.actor_label} />
                      </TableCell>
                      <TableCell>{actionLabel(entry.action)}</TableCell>
                      <TableCell className="break-words" title={entry.resource_id}>
                        {href ? (
                          <a href={href} className="text-highlight underline">
                            {entry.resource_name || typeLabel}
                          </a>
                        ) : (
                          entry.resource_name || typeLabel
                        )}
                        {entry.resource_name && (
                          <small className="block text-subtle">{typeLabel}</small>
                        )}
                      </TableCell>
                      <TableCell className="break-words">
                        {Object.keys(entry.details).length > 0 && (
                          <details>
                            <summary className="cursor-pointer">
                              {m.admin_audit_column_details()}
                            </summary>
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text={m.admin_audit_previous_page()}
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-2 text-subtle text-sm" aria-current="page">
                    {m.admin_audit_page_label({ page })}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    text={m.admin_audit_next_page()}
                    size="sm"
                    disabled={entries.length < PAGE_SIZE}
                    onClick={() => setPage((p) => p + 1)}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </>
        )}
      </CardContent>
    </Card>
  );
}
