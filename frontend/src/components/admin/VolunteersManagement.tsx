import { PeopleDataTable, PersonName } from "./PeopleDataTable";
import { Button } from "@/components/ui/button";
import { PencilIcon, TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useState, useMemo } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import type { Person } from "@/types/person";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import VolunteerFormModal, { type VolunteerFormData } from "./VolunteerFormModal";

interface VolunteersManagementProps {
  authHeaders: () => Record<string, string>;
  onCreate: (data: VolunteerFormData) => Promise<void>;
  onUpdate: (id: string, data: VolunteerFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const columnHelper = createAppColumnHelper<Person>();

function formatPeriod(period: Person["helpPeriods"][number]): string {
  return period.lastHelpDay
    ? `${period.firstHelpDay} → ${period.lastHelpDay}`
    : `${period.firstHelpDay} →`;
}

export default function VolunteersManagement({
  authHeaders,
  onCreate,
  onUpdate,
  onDelete,
}: VolunteersManagementProps) {
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Person | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(deletingId);
      setDeleteSuccess(true);
      setDeletingId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : m.admin_volunteers_error_delete());
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveVolunteer = async (data: VolunteerFormData) => {
    if (editingVolunteer) {
      await onUpdate(editingVolunteer.id, data);
      setUpdateSuccess(true);
    } else {
      await onCreate(data);
      setCreateSuccess(true);
    }
  };

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.name, {
          id: "name",
          header: m.registration_name(),
          cell: ({ row }) => {
            const volunteer = row.original;
            return <PersonName person={volunteer} />;
          },
        }),
        columnHelper.accessor("address", {
          enableSorting: false,
          header: m.admin_people_address_label(),
          cell: ({ getValue }) => <span className="text-sm">{String(getValue() ?? "")}</span>,
        }),
        columnHelper.accessor("nationalRegisterNumber", {
          header: m.admin_people_national_register_number_label(),
          enableSorting: false,
          cell: ({ getValue }) => <span className="text-sm">{String(getValue() ?? "")}</span>,
        }),
        columnHelper.accessor("eidDocumentNumber", {
          header: m.admin_people_eid_document_number_label(),
          enableSorting: false,
          cell: ({ getValue }) => <span className="text-sm">{String(getValue() ?? "")}</span>,
        }),
        columnHelper.display({
          id: "helpPeriods",
          header: m.admin_volunteers_help_periods_label(),
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex flex-col gap-1 text-sm">
              {row.original.helpPeriods.length > 0 ? (
                row.original.helpPeriods.map((period) => (
                  <span key={period.id} className="text-subtle">
                    {formatPeriod(period)}
                    {period.notes && (
                      <span className="block text-subtle opacity-75">{period.notes}</span>
                    )}
                  </span>
                ))
              ) : (
                <span className="text-subtle">{m.admin_volunteers_no_help_periods()}</span>
              )}
            </div>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const volunteer = row.original;
            return (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingVolunteer(volunteer);
                    setShowForm(true);
                  }}
                  title={m.admin_volunteers_edit_title()}
                  aria-label={m.admin_volunteers_edit_title()}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => {
                    setDeletingId(volunteer.id);
                    setDeleteError("");
                  }}
                  title={m.admin_volunteers_delete_title()}
                  aria-label={m.admin_volunteers_delete_title()}
                >
                  <Icon icon={TrashIcon} />
                </Button>
              </div>
            );
          },
        }),
      ]),
    [setEditingVolunteer, setShowForm, setDeletingId, setDeleteError],
  );

  return (
    <>
      <Card tone="secondary">
        <CardHeader>{m.admin_volunteers_tab()}</CardHeader>

        <CardContent className="p-0">
          {createSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setCreateSuccess(false)}>
              {m.admin_volunteers_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setUpdateSuccess(false)}>
              {m.admin_volunteers_update_success()}
            </Alert>
          )}
          {deleteSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setDeleteSuccess(false)}>
              {m.admin_volunteers_delete_success()}
            </Alert>
          )}

          <PeopleDataTable
            id="volunteers"
            authHeaders={authHeaders}
            columns={columns}
            onOpen={(person) => {
              setEditingVolunteer(person);
              setShowForm(true);
            }}
            primaryAction={
              <Button
                variant="outline-primary"
                onClick={() => {
                  setEditingVolunteer(null);
                  setShowForm(true);
                }}
              >
                {m.admin_volunteers_add()}
              </Button>
            }
          />
        </CardContent>
      </Card>

      {deletingId && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeletingId(null);
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle className="text-destructive">
                <Icon icon={TrashIcon} className="me-2" />
                {m.admin_volunteers_delete_title()}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              {deleteError && <Alert variant="danger">{deleteError}</Alert>}
              <p>{m.admin_volunteers_delete_confirm()}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>
                {m.admin_action_cancel()}
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? <Spinner size="sm" /> : <Icon icon={TrashIcon} />}
                {m.admin_action_confirm()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <VolunteerFormModal
        show={showForm}
        volunteer={editingVolunteer}
        onSave={handleSaveVolunteer}
        onHide={() => {
          setShowForm(false);
          setEditingVolunteer(null);
        }}
      />
    </>
  );
}
