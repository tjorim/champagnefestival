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
 * (see backend/app/audit.py). This is the first UI surface that reads it back —
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
import { m } from "@/paraglide/messages";
import { fetchAuditEntries, fetchAuditResourceTypes } from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";
import { devError } from "@/utils/devLog";

const PAGE_SIZE = 50;

interface AuditLogViewerProps {
  authHeaders: () => Record<string, string>;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function AuditLogViewer({ authHeaders }: AuditLogViewerProps) {
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [page, setPage] = useState(1);

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.admin.auditResourceTypes,
    queryFn: () => fetchAuditResourceTypes(authHeaders),
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
      fetchAuditEntries(authHeaders, {
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

  const handleActorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setActor(e.target.value);
    setPage(1);
  }, []);

  const handleActionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAction(e.target.value);
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

  if (entriesQuery.error) {
    devError("Failed to load audit log", entriesQuery.error);
  }

  return (
    <div>
      <div className="tw:flex tw:justify-between tw:items-center tw:mb-4">
        <h2 className="tw:text-2xl tw:font-medium tw:leading-tight tw:mb-0">
          {m.admin_audit_log_title()}
        </h2>
      </div>

      <form className="tw:flex tw:flex-wrap tw:gap-4 tw:mb-4">
        <AdminField controlId="audit-resource-type">
          <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
            {m.admin_audit_filter_resource_type()}
          </AdminLabel>
          <AdminSelect
            size="sm"
            value={resourceType}
            onValueChange={handleResourceTypeChange}
            className="tw:min-w-45"
          >
            <AdminOption value="">{m.admin_audit_filter_all()}</AdminOption>
            {(resourceTypesQuery.data ?? []).map((type) => (
              <AdminOption key={type} value={type}>
                {type}
              </AdminOption>
            ))}
          </AdminSelect>
        </AdminField>
        <AdminField controlId="audit-resource-id">
          <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
            {m.admin_audit_filter_resource_id()}
          </AdminLabel>
          <AdminInput
            size="sm"
            type="text"
            value={resourceId}
            onChange={handleResourceIdChange}
            placeholder={m.admin_audit_filter_resource_id_placeholder()}
            className="tw:min-w-50"
          />
        </AdminField>
        <AdminField controlId="audit-actor">
          <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
            {m.admin_audit_filter_actor()}
          </AdminLabel>
          <AdminInput
            size="sm"
            type="text"
            value={actor}
            onChange={handleActorChange}
            placeholder={m.admin_audit_filter_actor_placeholder()}
            className="tw:min-w-50"
          />
        </AdminField>
        <AdminField controlId="audit-action">
          <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
            {m.admin_audit_filter_action()}
          </AdminLabel>
          <AdminInput
            size="sm"
            type="text"
            value={action}
            onChange={handleActionChange}
            placeholder={m.admin_audit_filter_action_placeholder()}
            className="tw:min-w-45"
          />
        </AdminField>
        <AdminField controlId="audit-since">
          <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
            {m.admin_audit_filter_since()}
          </AdminLabel>
          <AdminInput size="sm" type="date" value={since} onChange={handleSinceChange} />
        </AdminField>
        <AdminField controlId="audit-until">
          <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
            {m.admin_audit_filter_until()}
          </AdminLabel>
          <AdminInput size="sm" type="date" value={until} onChange={handleUntilChange} />
        </AdminField>
        {hasFilters && (
          <AdminField className="tw:self-end">
            <Button variant="outline" size="sm" onClick={handleClearFilters}>
              {m.admin_content_clear_filters()}
            </Button>
          </AdminField>
        )}
      </form>

      {entriesQuery.error && (
        <Alert variant="danger" className="tw:mb-4">
          {m.admin_error_load_data()}
        </Alert>
      )}

      {entriesQuery.isPending ? (
        <div className="tw:text-center tw:py-12">
          <Spinner variant="primary" role="status">
            <span className="tw:sr-only">{m.admin_loading()}</span>
          </Spinner>
        </div>
      ) : entries.length === 0 ? (
        <p className="tw:text-subtle">{m.admin_audit_no_entries()}</p>
      ) : (
        <>
          <Table>
            <caption className="tw:sr-only">{m.admin_audit_table_caption()}</caption>
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
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatTimestamp(entry.timestamp)}</TableCell>
                  <TableCell className="tw:break-words">{entry.actor}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell className="tw:break-words">
                    {entry.resourceType} / {entry.resourceId}
                  </TableCell>
                  <TableCell className="tw:break-words">
                    {Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="tw:flex tw:justify-between tw:items-center">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {m.admin_audit_previous_page()}
            </Button>
            <span className="tw:text-subtle tw:text-sm">{m.admin_audit_page_label({ page })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={entries.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              {m.admin_audit_next_page()}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
