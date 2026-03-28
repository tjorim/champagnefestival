/**
 * TableTypeManagement — CRUD for table type templates.
 *
 * Managers define reusable table templates (shape, dimensions, height, max
 * capacity) here. The Layout component then picks a type when placing a table.
 */

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { TableType } from "@/types/admin";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";

interface TableTypeManagementProps {
  tableTypes: TableType[];
  onAdd: (data: Omit<TableType, "id">) => Promise<void>;
  onUpdate: (id: string, data: Partial<Omit<TableType, "id">>) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
}

const emptyForm = {
  name: "",
  shape: "rectangle" as "rectangle" | "round",
  widthM: 0.7,
  lengthM: 1.8,
  heightType: "low" as "low" | "high",
  maxCapacity: 4,
  active: true,
};

const columnHelper = createAppColumnHelper<TableType>();

export default function TableTypeManagement({
  tableTypes,
  onAdd,
  onUpdate,
  onArchive,
  onRestore,
}: TableTypeManagementProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((tt: TableType) => {
    setEditingId(tt.id);
    setForm({
      name: tt.name,
      shape: tt.shape,
      widthM: tt.widthM,
      lengthM: tt.lengthM,
      heightType: tt.heightType,
      maxCapacity: tt.maxCapacity,
      active: tt.active,
    });
    setError(null);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || form.maxCapacity < 1 || !Number.isInteger(form.maxCapacity)) return;
    if (
      !Number.isFinite(form.widthM) ||
      form.widthM <= 0 ||
      !Number.isFinite(form.lengthM) ||
      form.lengthM <= 0
    ) {
      setError("Width and length must be positive numbers.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const { active: _active, ...updateData } = form;
        await onUpdate(editingId, updateData);
      } else {
        await onAdd(form);
      }
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    } finally {
      setSaving(false);
    }
  }, [form, editingId, onAdd, onUpdate]);

  const handleArchive = useCallback(
    async (id: string) => {
      setDeleteError(null);
      try {
        await onArchive(id);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onArchive],
  );

  const handleRestore = useCallback(
    async (id: string) => {
      setDeleteError(null);
      try {
        await onRestore(id);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
    [onRestore],
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: m.admin_table_name(),
          enableSorting: false,
          meta: { tdClassName: "fw-semibold" },
          cell: ({ row }) => (
            <>
              {row.original.name}
              {!row.original.active && (
                <Badge bg="secondary" className="ms-2 fs-2xs">
                  {m.admin_venue_archived_badge()}
                </Badge>
              )}
            </>
          ),
        }),
        columnHelper.accessor("shape", {
          header: m.admin_table_shape_label(),
          enableSorting: false,
          cell: ({ getValue }) => (
            <Badge bg="secondary">
              {getValue() === "round"
                ? m.admin_table_shape_round()
                : m.admin_table_shape_rectangle()}
            </Badge>
          ),
        }),
        columnHelper.accessor("widthM", {
          header: m.admin_table_width_label(),
          enableSorting: false,
          cell: ({ getValue }) => `${getValue()} m`,
        }),
        columnHelper.accessor("lengthM", {
          header: m.admin_table_length_label(),
          enableSorting: false,
          cell: ({ row }) =>
            row.original.shape === "round" ? "—" : `${row.original.lengthM} m`,
        }),
        columnHelper.accessor("heightType", {
          header: m.admin_table_height_type_label(),
          enableSorting: false,
          cell: ({ getValue }) => {
            const ht = getValue();
            return (
              <Badge
                bg={ht === "high" ? "info" : "dark"}
                text={ht === "high" ? "dark" : "secondary"}
                className="border border-secondary"
              >
                {ht === "high"
                  ? m.admin_table_height_type_high()
                  : m.admin_table_height_type_low()}
              </Badge>
            );
          },
        }),
        columnHelper.accessor("maxCapacity", {
          header: m.admin_table_type_max_capacity(),
          enableSorting: false,
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const tt = row.original;
            return (
              <div className="d-flex gap-1">
                {tt.active && (
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => openEdit(tt)}
                    aria-label={m.admin_edit()}
                    title={m.admin_edit()}
                  >
                    <i className="bi bi-pencil" aria-hidden="true" />
                  </Button>
                )}
                {tt.active ? (
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => handleArchive(tt.id)}
                    aria-label={m.admin_content_archive()}
                    title={m.admin_content_archive()}
                  >
                    <i className="bi bi-archive" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => handleRestore(tt.id)}
                    aria-label={m.admin_content_restore()}
                    title={m.admin_content_restore()}
                  >
                    <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          },
        }),
      ]),
    [openEdit, handleArchive, handleRestore],
  );

  const table = useAppTable(
    {
      data: tableTypes,
      columns,
      getRowId: (row) => row.id,
    },
    () => ({}),
  );

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <span className="fw-semibold">{m.admin_table_types_tab()}</span>
          <Button variant="outline-warning" size="sm" onClick={openAdd}>
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            {m.admin_add_table_type()}
          </Button>
        </Card.Header>
        <Card.Body className="p-0">
          {deleteError && (
            <Alert variant="danger" className="m-3 py-1 small">
              {deleteError}
            </Alert>
          )}
          {tableTypes.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_no_table_types()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => (
                        <th key={header.id} className={header.column.columnDef.meta?.tdClassName}>
                          <table.FlexRender header={header} />
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className={clsx(!row.original.active && "opacity-50")}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName}>
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal
        show={showModal}
        onHide={() => setShowModal(false)}
        centered
        aria-labelledby="table-type-modal-title"
      >
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title id="table-type-modal-title">
            {editingId ? m.admin_edit_table_type() : m.admin_add_table_type()}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {error && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {error}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="tt-name">
            <Form.Label>{m.admin_table_name()}</Form.Label>
            <Form.Control
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="bg-dark text-light border-secondary"
              placeholder={m.admin_table_type_name_placeholder()}
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="tt-shape">
            <Form.Label>{m.admin_table_shape_label()}</Form.Label>
            <Form.Select
              value={form.shape}
              onChange={(e) => {
                const s = e.target.value as "rectangle" | "round";
                setForm((p) => ({
                  ...p,
                  shape: s,
                  widthM: s === "round" ? 0.9 : 0.7,
                  lengthM: s === "round" ? 0.9 : 1.8,
                }));
              }}
              className="bg-dark text-light border-secondary"
            >
              <option value="rectangle">{m.admin_table_shape_rectangle()}</option>
              <option value="round">{m.admin_table_shape_round()}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="tt-height-type">
            <Form.Label>{m.admin_table_height_type_label()}</Form.Label>
            <Form.Select
              value={form.heightType}
              onChange={(e) =>
                setForm((p) => ({ ...p, heightType: e.target.value as "low" | "high" }))
              }
              className="bg-dark text-light border-secondary"
            >
              <option value="low">{m.admin_table_height_type_low()}</option>
              <option value="high">{m.admin_table_height_type_high()}</option>
            </Form.Select>
          </Form.Group>
          {form.shape === "round" ? (
            <Form.Group className="mb-3" controlId="tt-diameter">
              <Form.Label>{m.admin_table_diameter_label()}</Form.Label>
              <Form.Control
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                value={form.widthM}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm((p) => ({ ...p, widthM: v, lengthM: v }));
                }}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
          ) : (
            <div className="row g-2 mb-3">
              <div className="col">
                <Form.Group controlId="tt-width">
                  <Form.Label>{m.admin_table_width_label()}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0.1}
                    max={20}
                    step={0.1}
                    value={form.widthM}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm((p) =>
                        v > p.lengthM
                          ? { ...p, widthM: p.lengthM, lengthM: v }
                          : { ...p, widthM: v },
                      );
                    }}
                    className="bg-dark text-light border-secondary"
                  />
                </Form.Group>
              </div>
              <div className="col">
                <Form.Group controlId="tt-length">
                  <Form.Label>{m.admin_table_length_label()}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0.1}
                    max={20}
                    step={0.1}
                    value={form.lengthM}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm((p) =>
                        v < p.widthM
                          ? { ...p, lengthM: p.widthM, widthM: v }
                          : { ...p, lengthM: v },
                      );
                    }}
                    className="bg-dark text-light border-secondary"
                  />
                </Form.Group>
              </div>
            </div>
          )}
          <Form.Group controlId="tt-max-capacity">
            <Form.Label>{m.admin_table_type_max_capacity()}</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={50}
              value={form.maxCapacity}
              onChange={(e) => setForm((p) => ({ ...p, maxCapacity: Number(e.target.value) }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant="warning"
            onClick={handleSave}
            disabled={
              saving ||
              !form.name.trim() ||
              form.maxCapacity < 1 ||
              !Number.isInteger(form.maxCapacity)
            }
          >
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
