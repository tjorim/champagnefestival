import { useEffect, useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import type { FloorArea, FloorTable, Layout, TableType } from "@/types/admin";
import { m } from "@/paraglide/messages";
import { getDayLabel, type DayOption } from "./LayoutEditor";

interface LayoutCompareModalProps {
  show: boolean;
  onHide: () => void;
  roomLayouts: Layout[];
  tables: FloorTable[];
  areas: FloorArea[];
  tableTypes: TableType[];
  dayOptions: DayOption[];
}

interface TableDiffRow {
  name: string;
  status: "added" | "removed" | "changed" | "unchanged";
  changes: string[];
}

interface AreaDiffRow {
  label: string;
  status: "added" | "removed" | "changed" | "unchanged";
}

function tableTypeName(id: string, tableTypes: TableType[]): string {
  return tableTypes.find((tt) => tt.id === id)?.name ?? id;
}

function diffTables(
  before: FloorTable[],
  after: FloorTable[],
  tableTypes: TableType[],
): TableDiffRow[] {
  const beforeByName = new Map(before.map((t) => [t.name, t]));
  const afterByName = new Map(after.map((t) => [t.name, t]));
  const names = [...new Set([...beforeByName.keys(), ...afterByName.keys()])].sort();

  return names.map((name) => {
    const a = beforeByName.get(name);
    const b = afterByName.get(name);
    if (a && !b) return { name, status: "removed", changes: [] };
    if (!a && b) return { name, status: "added", changes: [] };
    if (!a || !b) return { name, status: "unchanged", changes: [] };

    const changes: string[] = [];
    if (a.capacity !== b.capacity) {
      changes.push(
        m.admin_layout_compare_capacity_changed({ before: a.capacity, after: b.capacity }),
      );
    }
    if (a.tableTypeId !== b.tableTypeId) {
      changes.push(
        m.admin_layout_compare_type_changed({
          before: tableTypeName(a.tableTypeId, tableTypes),
          after: tableTypeName(b.tableTypeId, tableTypes),
        }),
      );
    }
    if (Math.round(a.x) !== Math.round(b.x) || Math.round(a.y) !== Math.round(b.y)) {
      changes.push(m.admin_layout_compare_moved());
    }
    if (a.rotation !== b.rotation) {
      changes.push(m.admin_layout_compare_rotated());
    }
    return { name, status: changes.length ? "changed" : "unchanged", changes };
  });
}

function diffAreas(before: FloorArea[], after: FloorArea[]): AreaDiffRow[] {
  const beforeByLabel = new Map(before.map((a) => [a.label, a]));
  const afterByLabel = new Map(after.map((a) => [a.label, a]));
  const labels = [...new Set([...beforeByLabel.keys(), ...afterByLabel.keys()])].sort();

  return labels.map((label) => {
    const a = beforeByLabel.get(label);
    const b = afterByLabel.get(label);
    if (a && !b) return { label, status: "removed" };
    if (!a && b) return { label, status: "added" };
    if (!a || !b) return { label, status: "unchanged" };
    const changed =
      Math.round(a.x) !== Math.round(b.x) ||
      Math.round(a.y) !== Math.round(b.y) ||
      a.rotation !== b.rotation ||
      a.widthM !== b.widthM ||
      a.lengthM !== b.lengthM;
    return { label, status: changed ? "changed" : "unchanged" };
  });
}

function statusBadge(status: "added" | "removed" | "changed" | "unchanged") {
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
    default:
      return null;
  }
}

export default function LayoutCompareModal({
  show,
  onHide,
  roomLayouts,
  tables,
  areas,
  tableTypes,
  dayOptions,
}: LayoutCompareModalProps) {
  const [baselineId, setBaselineId] = useState<string>(roomLayouts[0]?.id ?? "");
  const [currentId, setCurrentId] = useState<string>(
    roomLayouts[1]?.id ?? roomLayouts[0]?.id ?? "",
  );

  useEffect(() => {
    const baselineFallback = roomLayouts[0]?.id ?? "";
    const currentFallback = roomLayouts[1]?.id ?? baselineFallback;
    const hasLayout = (id: string) => roomLayouts.some((layout) => layout.id === id);

    setBaselineId((id) => (hasLayout(id) ? id : baselineFallback));
    setCurrentId((id) => (hasLayout(id) ? id : currentFallback));
  }, [roomLayouts]);

  const baselineTables = useMemo(
    () => tables.filter((t) => t.layoutId === baselineId),
    [tables, baselineId],
  );
  const currentTables = useMemo(
    () => tables.filter((t) => t.layoutId === currentId),
    [tables, currentId],
  );
  const baselineAreas = useMemo(
    () => areas.filter((a) => a.layoutId === baselineId),
    [areas, baselineId],
  );
  const currentAreas = useMemo(
    () => areas.filter((a) => a.layoutId === currentId),
    [areas, currentId],
  );

  const tableDiff = useMemo(
    () =>
      diffTables(baselineTables, currentTables, tableTypes).filter(
        (row) => row.status !== "unchanged",
      ),
    [baselineTables, currentTables, tableTypes],
  );
  const areaDiff = useMemo(
    () => diffAreas(baselineAreas, currentAreas).filter((row) => row.status !== "unchanged"),
    [baselineAreas, currentAreas],
  );

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{m.admin_layout_compare_title()}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-secondary small">{m.admin_layout_compare_scope_note()}</p>
        <div className="d-flex gap-3 flex-wrap mb-3">
          <Form.Group style={{ minWidth: "180px", flex: "1 1 180px" }}>
            <Form.Label className="small text-secondary">
              {m.admin_layout_compare_baseline()}
            </Form.Label>
            <Form.Select value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
              {roomLayouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {getDayLabel(layout, dayOptions)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group style={{ minWidth: "180px", flex: "1 1 180px" }}>
            <Form.Label className="small text-secondary">
              {m.admin_layout_compare_current()}
            </Form.Label>
            <Form.Select value={currentId} onChange={(e) => setCurrentId(e.target.value)}>
              {roomLayouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {getDayLabel(layout, dayOptions)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </div>

        {baselineId === currentId ? (
          <p className="text-secondary small mb-0">{m.admin_layout_compare_same_plan()}</p>
        ) : tableDiff.length === 0 && areaDiff.length === 0 ? (
          <p className="text-secondary small mb-0">{m.admin_layout_compare_no_changes()}</p>
        ) : (
          <>
            {tableDiff.length > 0 && (
              <>
                <h6 className="fs-6">{m.admin_layout_compare_tables()}</h6>
                <ListGroup variant="flush" className="mb-3">
                  {tableDiff.map((row) => (
                    <ListGroup.Item
                      key={row.name}
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
              </>
            )}
            {areaDiff.length > 0 && (
              <>
                <h6 className="fs-6">{m.admin_layout_compare_areas()}</h6>
                <ListGroup variant="flush">
                  {areaDiff.map((row) => (
                    <ListGroup.Item
                      key={row.label}
                      className="d-flex justify-content-between align-items-center gap-2"
                    >
                      <span className="small">{row.label}</span>
                      {statusBadge(row.status)}
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
