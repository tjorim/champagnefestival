import {
  AdminInput,
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { MinusIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
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
        <Badge variant="success">
          <Icon icon={PlusIcon} className="tw:me-1" />
          {m.admin_layout_compare_added()}
        </Badge>
      );
    case "removed":
      return (
        <Badge variant="danger">
          <Icon icon={MinusIcon} className="tw:me-1" />
          {m.admin_layout_compare_removed()}
        </Badge>
      );
    case "changed":
      return (
        <Badge variant="warning">
          <Icon icon={PencilIcon} className="tw:me-1" />
          {m.admin_layout_compare_changed()}
        </Badge>
      );
  }
}

function DiffRowsList({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) return null;
  return (
    <PresentationList flush className="tw:mb-4">
      {rows.map((row) => (
        <PresentationListItem
          key={row.id}
          className="tw:flex tw:justify-between tw:items-start tw:gap-2"
        >
          <div className="tw:min-w-0">
            <div className="tw:font-semibold tw:text-sm">{row.name}</div>
            {row.changes.length > 0 && (
              <div className="tw:text-subtle tw:text-sm">{row.changes.join(", ")}</div>
            )}
          </div>
          {statusBadge(row.status)}
        </PresentationListItem>
      ))}
    </PresentationList>
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

  const saveForm = useForm({
    defaultValues: { label: "", changeNote: "" },
    onSubmit: async ({ value }) => {
      if (!value.label.trim()) return;
      setSaveError(null);
      try {
        await onSaveRevision(layoutId, value.label.trim(), value.changeNote.trim() || undefined);
        saveForm.reset();
        await loadRevisions();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    },
  });
  const saving = useSelector(saveForm.atom, (s) => s.isSubmitting);
  const saveLabelValue = useSelector(saveForm.atom, (s) => s.values.label);

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
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>{m.admin_layout_revisions_title()}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="tw:text-subtle tw:text-sm">{m.admin_layout_revisions_scope_note()}</p>

          {/* Save */}
          <form
            className="tw:flex tw:flex-wrap tw:gap-2 tw:items-start tw:mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveForm.handleSubmit();
            }}
          >
            <saveForm.Field name="label">
              {(field) => (
                <AdminInput
                  className="tw:grow-1 tw:shrink-1 tw:basis-55"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={m.admin_layout_revisions_label_placeholder()}
                  maxLength={200}
                  required
                />
              )}
            </saveForm.Field>
            <saveForm.Field name="changeNote">
              {(field) => (
                <AdminInput
                  className="tw:grow-2 tw:shrink-1 tw:basis-70"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={m.admin_layout_revisions_change_note_placeholder()}
                  maxLength={2000}
                />
              )}
            </saveForm.Field>
            <Button type="submit" variant="success" disabled={saving || !saveLabelValue.trim()}>
              {saving ? m.admin_layout_revisions_saving() : m.admin_layout_revisions_save()}
            </Button>
          </form>
          {saveError && (
            <Alert variant="danger" className="tw:py-2 tw:text-sm">
              {saveError}
            </Alert>
          )}

          {/* List */}
          {loading ? (
            <div className="tw:text-center tw:py-4">
              <Spinner label={m.admin_loading()} size="sm" />
            </div>
          ) : loadError ? (
            <Alert variant="danger" className="tw:py-2 tw:text-sm">
              {loadError}
            </Alert>
          ) : revisions.length === 0 ? (
            <p className="tw:text-subtle tw:text-sm">{m.admin_layout_revisions_empty()}</p>
          ) : (
            <PresentationList flush className="tw:mb-4">
              {revisionOptions.map((revision) => (
                <PresentationListItem
                  key={revision.id}
                  className="tw:flex tw:justify-between tw:items-center tw:gap-2"
                >
                  <div className="tw:min-w-0">
                    <div className="tw:font-semibold tw:text-sm">
                      #{revision.revisionNumber} {revision.label}
                    </div>
                    <div className="tw:text-subtle tw:text-micro">
                      {m.admin_layout_revisions_created_by({ actor: revision.createdBy })} ·{" "}
                      {new Date(revision.createdAt).toLocaleString()}
                      {revision.changeNote ? ` — ${revision.changeNote}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline-warning"
                    className="tw:shrink-0"
                    onClick={() => void openRestorePreview(revision.revisionNumber)}
                  >
                    {m.admin_layout_revisions_restore()}
                  </Button>
                </PresentationListItem>
              ))}
            </PresentationList>
          )}

          {/* Compare */}
          {revisions.length > 0 && (
            <>
              <h6 className="tw:text-base">{m.admin_layout_revisions_compare_title()}</h6>
              <div className="tw:flex tw:gap-4 tw:flex-wrap tw:mb-4">
                <AdminField className="tw:min-w-40 tw:grow-1 tw:shrink-1 tw:basis-40">
                  <AdminLabel className="tw:text-sm tw:text-subtle">
                    {m.admin_layout_revisions_compare_from()}
                  </AdminLabel>
                  <AdminSelect
                    aria-label={m.admin_layout_revisions_compare_from()}
                    value={compareFrom}
                    onValueChange={(e) => setCompareFrom(e)}
                  >
                    <AdminOption value={CURRENT_REF}>
                      {m.admin_layout_revisions_compare_current()}
                    </AdminOption>
                    {revisionOptions.map((revision) => (
                      <AdminOption key={revision.id} value={String(revision.revisionNumber)}>
                        #{revision.revisionNumber} {revision.label}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                </AdminField>
                <AdminField className="tw:min-w-40 tw:grow-1 tw:shrink-1 tw:basis-40">
                  <AdminLabel className="tw:text-sm tw:text-subtle">
                    {m.admin_layout_revisions_compare_to()}
                  </AdminLabel>
                  <AdminSelect
                    aria-label={m.admin_layout_revisions_compare_to()}
                    value={compareTo}
                    onValueChange={(e) => setCompareTo(e)}
                  >
                    <AdminOption value={CURRENT_REF}>
                      {m.admin_layout_revisions_compare_current()}
                    </AdminOption>
                    {revisionOptions.map((revision) => (
                      <AdminOption key={revision.id} value={String(revision.revisionNumber)}>
                        #{revision.revisionNumber} {revision.label}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                </AdminField>
              </div>
              {diffLoading ? (
                <div className="tw:text-center tw:py-2">
                  <Spinner label={m.admin_loading()} size="sm" />
                </div>
              ) : diffError ? (
                <Alert variant="danger" className="tw:py-2 tw:text-sm">
                  {diffError}
                </Alert>
              ) : compareFrom === compareTo ? null : diff &&
                tableDiffRows.length === 0 &&
                areaDiffRows.length === 0 ? (
                <p className="tw:text-subtle tw:text-sm">
                  {m.admin_layout_revisions_compare_no_changes()}
                </p>
              ) : (
                diff && (
                  <>
                    {tableDiffRows.length > 0 && (
                      <>
                        <div className="tw:font-semibold tw:text-sm tw:mb-1">
                          {m.admin_layout_compare_tables()}
                        </div>
                        <DiffRowsList rows={tableDiffRows} />
                      </>
                    )}
                    {areaDiffRows.length > 0 && (
                      <>
                        <div className="tw:font-semibold tw:text-sm tw:mb-1">
                          {m.admin_layout_compare_areas()}
                        </div>
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
            <div className="border rounded tw:p-2 tw:mt-4">
              <h6 className="tw:text-base">{m.admin_layout_revisions_restore_preview_title()}</h6>
              {previewLoading ? (
                <div className="tw:text-center tw:py-2">
                  <Spinner label={m.admin_loading()} size="sm" />
                </div>
              ) : previewError ? (
                <Alert variant="danger" className="tw:py-2 tw:text-sm">
                  {previewError}
                </Alert>
              ) : (
                preview && (
                  <>
                    {previewTableRows.length === 0 && previewAreaRows.length === 0 ? (
                      <p className="tw:text-subtle tw:text-sm">
                        {m.admin_layout_revisions_restore_no_changes()}
                      </p>
                    ) : (
                      <>
                        {previewTableRows.length > 0 && (
                          <>
                            <div className="tw:font-semibold tw:text-sm tw:mb-1">
                              {m.admin_layout_compare_tables()}
                            </div>
                            <DiffRowsList rows={previewTableRows} />
                          </>
                        )}
                        {previewAreaRows.length > 0 && (
                          <>
                            <div className="tw:font-semibold tw:text-sm tw:mb-1">
                              {m.admin_layout_compare_areas()}
                            </div>
                            <DiffRowsList rows={previewAreaRows} />
                          </>
                        )}
                      </>
                    )}
                    {preview.hasConflicts && (
                      <Alert variant="warning" className="tw:py-2 tw:text-sm">
                        <div className="tw:font-semibold tw:mb-1">
                          {m.admin_layout_revisions_restore_conflicts_title()}
                        </div>
                        <ul className="tw:mb-2 tw:ps-4">
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
                        <AdminCheck
                          type="checkbox"
                          id="layout-revision-resolve-allocations"
                          label={m.admin_layout_revisions_restore_override_checkbox()}
                          checked={resolveAllocations}
                          onCheckedChange={(e) => setResolveAllocations(e)}
                        />
                      </Alert>
                    )}
                    {restoreError && (
                      <Alert variant="danger" className="tw:py-2 tw:text-sm">
                        {restoreError}
                      </Alert>
                    )}
                    <div className="tw:flex tw:gap-2 tw:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
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
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
