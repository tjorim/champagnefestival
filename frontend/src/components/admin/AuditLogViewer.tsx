/**
 * AuditLogViewer — read-only browser for the operational audit trail.
 *
 * Every admin create/update/delete mutation writes an AuditEntry server-side
 * (see backend/app/audit.py). This is the first UI surface that reads it back —
 * previously the only way to see who did what was a direct DB query.
 */

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
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
  const [page, setPage] = useState(1);

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.admin.auditResourceTypes,
    queryFn: () => fetchAuditResourceTypes(authHeaders),
    staleTime: 60 * 1000,
  });

  const entriesQuery = useQuery({
    queryKey: queryKeys.admin.auditEntries({ resourceType, resourceId, page }),
    queryFn: () =>
      fetchAuditEntries(authHeaders, {
        resourceType: resourceType || undefined,
        resourceId: resourceId.trim() || undefined,
        limit: PAGE_SIZE,
        page,
      }),
    staleTime: 10 * 1000,
  });

  const handleResourceTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setResourceType(e.target.value);
    setPage(1);
  }, []);

  const handleResourceIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setResourceId(e.target.value);
    setPage(1);
  }, []);

  const entries = entriesQuery.data ?? [];

  if (entriesQuery.error) {
    devError("Failed to load audit log", entriesQuery.error);
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">{m.admin_audit_log_title()}</h2>
      </div>

      <Form className="d-flex flex-wrap gap-3 mb-3">
        <Form.Group>
          <Form.Label className="small text-secondary mb-1">
            {m.admin_audit_filter_resource_type()}
          </Form.Label>
          <Form.Select
            size="sm"
            value={resourceType}
            onChange={handleResourceTypeChange}
            style={{ minWidth: 180 }}
          >
            <option value="">{m.admin_audit_filter_all()}</option>
            {(resourceTypesQuery.data ?? []).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group>
          <Form.Label className="small text-secondary mb-1">
            {m.admin_audit_filter_resource_id()}
          </Form.Label>
          <Form.Control
            size="sm"
            type="text"
            value={resourceId}
            onChange={handleResourceIdChange}
            placeholder={m.admin_audit_filter_resource_id_placeholder()}
            style={{ minWidth: 200 }}
          />
        </Form.Group>
      </Form>

      {entriesQuery.error && (
        <Alert variant="danger" className="mb-3">
          {m.admin_error_load_data()}
        </Alert>
      )}

      {entriesQuery.isPending ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" role="status">
            <span className="visually-hidden">{m.admin_loading()}</span>
          </Spinner>
        </div>
      ) : entries.length === 0 ? (
        <p className="text-secondary">{m.admin_audit_no_entries()}</p>
      ) : (
        <>
          <Table striped bordered hover responsive size="sm" variant="dark">
            <caption className="visually-hidden">{m.admin_audit_table_caption()}</caption>
            <thead>
              <tr>
                <th scope="col">{m.admin_audit_column_timestamp()}</th>
                <th scope="col">{m.admin_audit_column_actor()}</th>
                <th scope="col">{m.admin_audit_column_action()}</th>
                <th scope="col">{m.admin_audit_column_resource()}</th>
                <th scope="col">{m.admin_audit_column_details()}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatTimestamp(entry.timestamp)}</td>
                  <td className="text-break">{entry.actor}</td>
                  <td>{entry.action}</td>
                  <td className="text-break">
                    {entry.resourceType} / {entry.resourceId}
                  </td>
                  <td className="text-break">
                    {Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="d-flex justify-content-between align-items-center">
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {m.admin_audit_previous_page()}
            </Button>
            <span className="text-secondary small">{m.admin_audit_page_label({ page })}</span>
            <Button
              variant="outline-secondary"
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
