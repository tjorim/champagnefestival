import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import type {
  LayoutRevision,
  LayoutRevisionAreaChange,
  LayoutRevisionDiff,
  LayoutRevisionSnapshotArea,
  LayoutRevisionSnapshotTable,
  LayoutRevisionTableChange,
  LayoutRestorePreview,
} from "@/types/admin";
import {
  compareLayoutRevisions,
  fetchLayoutRevisions,
  previewLayoutRestore,
} from "@/utils/adminFetch";
import { devError } from "@/utils/devLog";

const CURRENT_REF = "current";

interface LayoutRevisionsModalProps {
  show: boolean;
  onHide: () => void;
  layoutId: string;
  authHeaders: () => Record<string, string>;
  onSaveRevision: (layoutId: string, label: string, changeNote?: string) => Promise<LayoutRevision>;
  onRestoreRevision: (
    layoutId: string,
    revisionNumber: number,
    resolveAllocations?: boolean,
  ) => Promise<void>;
}

type DiffStatus = "added" | "removed" | "changed";

interface DiffRow {
  id: string;
  name: string;
  status: DiffStatus;
  changes: string[];
}

function formatFieldChange(change: { field: string; before: unknown; after: unknown }): string {
  switch (change.field) {
    case "x":
    case "y":
    case "rotation":
      return m.admin_layout_compare_moved();
    case "capacity":
      return m.admin_layout_compare_capacity_changed({
        before: String(change.before),
        after: String(change.after),
      });
    case "table_type_id":
    case "table_type_name":
      return m.admin_layout_compare_type_changed({
        before: String(change.before),
        after: String(change.after),
      });
    default:
      return `${change.field}: ${String(change.before)} → ${String(change.after)}`;
  }
}

function tableRows(
  added: LayoutRevisionSnapshotTable[],
  removed: LayoutRevisionSnapshotTable[],
  changed: LayoutRevisionTableChange[],
): DiffRow[] {
  return [
    ...added.map((t) => ({ id: t.id, name: t.name, status: "added" as const, changes: [] })),
    ...removed.map((t) => ({ id: t.id, name: t.name, status: "removed" as const, changes: [] })),
    ...changed.map((c) => ({
      id: c.id,
      name: c.after.name,
      status: "changed" as const,
      changes: c.changes.map(formatFieldChange),
    })),
  ];
}

function areaRows(
  added: LayoutRevisionSnapshotArea[],
  removed: LayoutRevisionSnapshotArea[],
  changed: LayoutRevisionAreaChange[],
): DiffRow[] {
  return [
    ...added.map((a) => ({ id: a.id, name: a.label, status: "added" as const, changes: [] })),
    ...removed.map((a) => ({ id: a.id, name: a.label, status: "removed" as const, changes: [] })),
    ...changed.map((c) => ({
      id: c.id,
      name: c.after.label,
      status: "changed" as const,
      changes: c.changes.map(formatFieldChange),
    })),
  ];
}

function statusBadge(status: DiffStatus) {
  switch (status) {
    case "added":
      return (
        <Badge bg="success">
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {m.admin_layout_compare_added()}
        </Badge>
      );
    case "removed":
      return (
        <Badge bg="danger">
          <i className="bi bi-dash-lg me-1" aria-hidden="true" />
          {m.admin_layout_compare_removed()}
        </Badge>
      );
    case "changed":
      return (
        <Badge bg="warning" text="dark">
          <i className="bi bi-pencil me-1" aria-hidden="true" />
          {m.admin_layout_compare_changed()}
        </Badge>
      );
  }
}

function DiffRowsList({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ListGroup variant="flush" className="mb-3">
      {rows.map((row) => (
        <ListGroup.Item
          key={row.id}
          className="d-flex justify-content-between align-items-start gap-2"
        >
          <div>
            <div className="fw-semibold small">{row.name}</div>
            {row.changes.length > 0 && (
              <div className="text-secondary small">{row.changes.join(", ")}</div>
            )}
          </div>
          {statusBadge(row.status)}
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
}

export default function LayoutRevisionsModal({
  show,
  onHide,
  layoutId,
  authHeaders,
  onSaveRevision,
  onRestoreRevision,
}: LayoutRevisionsModalProps) {
  const [revisions, setRevisions] = useState<LayoutRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [compareFrom, setCompareFrom] = useState<string>(CURRENT_REF);
  const [compareTo, setCompareTo] = useState<string>(CURRENT_REF);
  const [diff, setDiff] = useState<LayoutRevisionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [preview, setPreview] = useState<LayoutRestorePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [resolveAllocations, setResolveAllocations] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Guards against a stale response overwriting a newer one when the
  // selected refs change faster than the network round-trip: only the most
  // recently issued compare request is allowed to apply its result.
  const compareRequestRef = useRef(0);

  const loadRevisions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchLayoutRevisions(authHeaders, layoutId);
      setRevisions(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, layoutId]);

  useEffect(() => {
    if (!show) return;
    setSaveError(null);
    setDiff(null);
    setDiffError(null);
    setRestoreTarget(null);
    setPreview(null);
    setPreviewError(null);
    setResolveAllocations(false);
    setRestoreError(null);
    void loadRevisions();
    // Invalidate any compare request still in flight from a previous time
    // this modal was open, so it can never overwrite the fresh state above.
    return () => {
      compareRequestRef.current += 1;
    };
  }, [show, loadRevisions]);

  const revisionOptions = useMemo(
    () => [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber),
    [revisions],
  );

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveRevision(layoutId, label.trim(), changeNote.trim() || undefined);
      setLabel("");
      setChangeNote("");
      await loadRevisions();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const runCompare = useCallback(
    async (fromRef: string, toRef: string) => {
      const requestId = ++compareRequestRef.current;
      setDiffLoading(true);
      setDiffError(null);
      try {
        const result = await compareLayoutRevisions(authHeaders, layoutId, fromRef, toRef);
        if (compareRequestRef.current !== requestId) return;
        setDiff(result);
      } catch (error) {
        if (compareRequestRef.current !== requestId) return;
        setDiffError(error instanceof Error ? error.message : String(error));
        setDiff(null);
      } finally {
        if (compareRequestRef.current === requestId) setDiffLoading(false);
      }
    },
    [authHeaders, layoutId],
  );

  useEffect(() => {
    if (!show || revisions.length === 0) return;
    if (compareFrom === compareTo) {
      compareRequestRef.current += 1;
      setDiff(null);
      return;
    }
    void runCompare(compareFrom, compareTo);
  }, [show, compareFrom, compareTo, revisions.length, runCompare]);

  const openRestorePreview = async (revisionNumber: number) => {
    setRestoreTarget(revisionNumber);
    setPreview(null);
    setPreviewError(null);
    setResolveAllocations(false);
    setRestoreError(null);
    setPreviewLoading(true);
    try {
      setPreview(await previewLayoutRestore(authHeaders, layoutId, revisionNumber));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmRestore = async () => {
    if (restoreTarget === null) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await onRestoreRevision(layoutId, restoreTarget, resolveAllocations);
      setRestoreTarget(null);
      setPreview(null);
      await loadRevisions();
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : String(error));
      devError("Failed to restore layout revision", { error });
    } finally {
      setRestoring(false);
    }
  };

  const tableDiffRows = diff
    ? tableRows(diff.addedTables, diff.removedTables, diff.changedTables)
    : [];
  const areaDiffRows = diff ? areaRows(diff.addedAreas, diff.removedAreas, diff.changedAreas) : [];

  const previewTableRows = preview
    ? tableRows(preview.tablesToAdd, preview.tablesToRemove, preview.tablesToUpdate)
    : [];
  const previewAreaRows = preview
    ? areaRows(preview.areasToAdd, preview.areasToRemove, preview.areasToUpdate)
    : [];

  return (
    <Modal show={show} onHide={onHide} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{m.admin_layout_revisions_title()}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-secondary small">{m.admin_layout_revisions_scope_note()}</p>

        {/* Save */}
        <Form
          className="d-flex flex-wrap gap-2 align-items-start mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <Form.Control
            style={{ flex: "1 1 220px" }}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={m.admin_layout_revisions_label_placeholder()}
            maxLength={200}
            required
          />
          <Form.Control
            style={{ flex: "2 1 280px" }}
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder={m.admin_layout_revisions_change_note_placeholder()}
            maxLength={2000}
          />
          <Button type="submit" variant="success" disabled={saving || !label.trim()}>
            {saving ? m.admin_layout_revisions_saving() : m.admin_layout_revisions_save()}
          </Button>
        </Form>
        {saveError && (
          <Alert variant="danger" className="py-2 small">
            {saveError}
          </Alert>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        ) : loadError ? (
          <Alert variant="danger" className="py-2 small">
            {loadError}
          </Alert>
        ) : revisions.length === 0 ? (
          <p className="text-secondary small">{m.admin_layout_revisions_empty()}</p>
        ) : (
          <ListGroup variant="flush" className="mb-3">
            {revisionOptions.map((revision) => (
              <ListGroup.Item
                key={revision.id}
                className="d-flex justify-content-between align-items-center gap-2"
              >
                <div>
                  <div className="fw-semibold small">
                    #{revision.revisionNumber} {revision.label}
                  </div>
                  <div className="text-secondary fs-3xs">
                    {m.admin_layout_revisions_created_by({ actor: revision.createdBy })} ·{" "}
                    {new Date(revision.createdAt).toLocaleString()}
                    {revision.changeNote ? ` — ${revision.changeNote}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline-warning"
                  onClick={() => void openRestorePreview(revision.revisionNumber)}
                >
                  {m.admin_layout_revisions_restore()}
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}

        {/* Compare */}
        {revisions.length > 0 && (
          <>
            <h6 className="fs-6">{m.admin_layout_revisions_compare_title()}</h6>
            <div className="d-flex gap-3 flex-wrap mb-3">
              <Form.Group style={{ minWidth: "160px", flex: "1 1 160px" }}>
                <Form.Label className="small text-secondary">
                  {m.admin_layout_revisions_compare_from()}
                </Form.Label>
                <Form.Select
                  aria-label={m.admin_layout_revisions_compare_from()}
                  value={compareFrom}
                  onChange={(e) => setCompareFrom(e.target.value)}
                >
                  <option value={CURRENT_REF}>{m.admin_layout_revisions_compare_current()}</option>
                  {revisionOptions.map((revision) => (
                    <option key={revision.id} value={String(revision.revisionNumber)}>
                      #{revision.revisionNumber} {revision.label}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group style={{ minWidth: "160px", flex: "1 1 160px" }}>
                <Form.Label className="small text-secondary">
                  {m.admin_layout_revisions_compare_to()}
                </Form.Label>
                <Form.Select
                  aria-label={m.admin_layout_revisions_compare_to()}
                  value={compareTo}
                  onChange={(e) => setCompareTo(e.target.value)}
                >
                  <option value={CURRENT_REF}>{m.admin_layout_revisions_compare_current()}</option>
                  {revisionOptions.map((revision) => (
                    <option key={revision.id} value={String(revision.revisionNumber)}>
                      #{revision.revisionNumber} {revision.label}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            {diffLoading ? (
              <div className="text-center py-2">
                <Spinner animation="border" size="sm" />
              </div>
            ) : diffError ? (
              <Alert variant="danger" className="py-2 small">
                {diffError}
              </Alert>
            ) : compareFrom === compareTo ? null : diff &&
              tableDiffRows.length === 0 &&
              areaDiffRows.length === 0 ? (
              <p className="text-secondary small">
                {m.admin_layout_revisions_compare_no_changes()}
              </p>
            ) : (
              diff && (
                <>
                  {tableDiffRows.length > 0 && (
                    <>
                      <div className="fw-semibold small mb-1">
                        {m.admin_layout_compare_tables()}
                      </div>
                      <DiffRowsList rows={tableDiffRows} />
                    </>
                  )}
                  {areaDiffRows.length > 0 && (
                    <>
                      <div className="fw-semibold small mb-1">{m.admin_layout_compare_areas()}</div>
                      <DiffRowsList rows={areaDiffRows} />
                    </>
                  )}
                </>
              )
            )}
          </>
        )}

        {/* Restore preview / confirm */}
        {restoreTarget !== null && (
          <div className="border rounded p-2 mt-3">
            <h6 className="fs-6">{m.admin_layout_revisions_restore_preview_title()}</h6>
            {previewLoading ? (
              <div className="text-center py-2">
                <Spinner animation="border" size="sm" />
              </div>
            ) : previewError ? (
              <Alert variant="danger" className="py-2 small">
                {previewError}
              </Alert>
            ) : (
              preview && (
                <>
                  {previewTableRows.length === 0 && previewAreaRows.length === 0 ? (
                    <p className="text-secondary small">
                      {m.admin_layout_revisions_restore_no_changes()}
                    </p>
                  ) : (
                    <>
                      {previewTableRows.length > 0 && (
                        <>
                          <div className="fw-semibold small mb-1">
                            {m.admin_layout_compare_tables()}
                          </div>
                          <DiffRowsList rows={previewTableRows} />
                        </>
                      )}
                      {previewAreaRows.length > 0 && (
                        <>
                          <div className="fw-semibold small mb-1">
                            {m.admin_layout_compare_areas()}
                          </div>
                          <DiffRowsList rows={previewAreaRows} />
                        </>
                      )}
                    </>
                  )}
                  {preview.hasConflicts && (
                    <Alert variant="warning" className="py-2 small">
                      <div className="fw-semibold mb-1">
                        {m.admin_layout_revisions_restore_conflicts_title()}
                      </div>
                      <ul className="mb-2 ps-3">
                        {preview.allocationConflicts.map((conflict) => (
                          <li key={`${conflict.kind}-${conflict.id}`}>
                            {conflict.kind === "table" && conflict.reason === "deleted"
                              ? m.admin_layout_revisions_restore_conflict_table_deleted({
                                  name: conflict.name,
                                  count: conflict.registrationIds.length,
                                })
                              : conflict.kind === "table"
                                ? m.admin_layout_revisions_restore_conflict_table_moved({
                                    name: conflict.name,
                                    count: conflict.registrationIds.length,
                                  })
                                : m.admin_layout_revisions_restore_conflict_area_deleted({
                                    name: conflict.name,
                                  })}
                          </li>
                        ))}
                      </ul>
                      <Form.Check
                        type="checkbox"
                        id="layout-revision-resolve-allocations"
                        label={m.admin_layout_revisions_restore_override_checkbox()}
                        checked={resolveAllocations}
                        onChange={(e) => setResolveAllocations(e.target.checked)}
                      />
                    </Alert>
                  )}
                  {restoreError && (
                    <Alert variant="danger" className="py-2 small">
                      {restoreError}
                    </Alert>
                  )}
                  <div className="d-flex gap-2 justify-content-end">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => {
                        setRestoreTarget(null);
                        setPreview(null);
                      }}
                    >
                      {m.admin_layout_revisions_restore_cancel()}
                    </Button>
                    <Button
                      size="sm"
                      variant="warning"
                      disabled={restoring || (preview.hasConflicts && !resolveAllocations)}
                      onClick={() => void confirmRestore()}
                    >
                      {m.admin_layout_revisions_restore_confirm()}
                    </Button>
                  </div>
                </>
              )
            )}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}
