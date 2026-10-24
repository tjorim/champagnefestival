import { PeopleDataTable, PersonName } from "./PeopleDataTable";
import { Button } from "@/components/ui/button";
import { MailCheckIcon, PencilIcon, RotateCcwIcon, TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useCallback, useState, useMemo } from "react";
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
import { apiErrorMessage } from "@/utils/apiErrors";
import { isRoleActive, lastHelpedDay, roleSince, type Person } from "@/types/person";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import PersonEmailConsents from "./PersonEmailConsents";
import VolunteerFormModal, { type VolunteerFormData } from "./VolunteerFormModal";

interface VolunteersManagementProps {
  authHeaders: () => Record<string, string>;
  onCreate: (data: VolunteerFormData) => Promise<void>;
  onUpdate: (id: string, data: VolunteerFormData) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  onReactivate: (id: string) => Promise<void>;
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
  onDeactivate,
  onReactivate,
}: VolunteersManagementProps) {
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deactivateSuccess, setDeactivateSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Person | null>(null);
  const [consentPerson, setConsentPerson] = useState<Person | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");
  const [reactivateSuccess, setReactivateSuccess] = useState(false);
  const [reactivateError, setReactivateError] = useState("");
  const handleReactivate = useCallback(
    async (id: string) => {
      setReactivateError("");
      try {
        await onReactivate(id);
        setReactivateSuccess(true);
      } catch (err) {
        setReactivateError(apiErrorMessage(err, m.admin_volunteers_error_reactivate()));
      }
    },
    [onReactivate],
  );
  const handleDeactivateConfirm = async () => {
    if (!deactivatingId) return;
    setDeactivating(true);
    setDeactivateError("");
    try {
      await onDeactivate(deactivatingId);
      setDeactivateSuccess(true);
      setDeactivatingId(null);
    } catch (err) {
      setDeactivateError(apiErrorMessage(err, m.admin_volunteers_error_deactivate()));
    } finally {
      setDeactivating(false);
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
            return <PersonName person={volunteer} role="volunteer" />;
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
          id: "volunteerSince",
          header: m.admin_volunteers_since_label(),
          enableSorting: false,
          cell: ({ row }) => (
            <span className="text-sm text-subtle">
              {roleSince(row.original, "volunteer") ?? "—"}
            </span>
          ),
        }),
        columnHelper.display({
          id: "lastHelped",
          header: m.admin_volunteers_last_helped_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const last = lastHelpedDay(row.original.helpPeriods);
            return (
              <span className="text-sm text-subtle">
                {last === "ongoing" ? m.admin_volunteers_last_helped_ongoing() : (last ?? "—")}
              </span>
            );
          },
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
                  onClick={() => setConsentPerson(volunteer)}
                  title={m.admin_email_consents()}
                  aria-label={`${m.admin_email_consents()}: ${volunteer.name}`}
                >
                  <Icon icon={MailCheckIcon} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingVolunteer(volunteer);
                    setShowForm(true);
                  }}
                  title={m.admin_volunteers_edit_title()}
                  aria-label={`${m.admin_volunteers_edit_title()}: ${volunteer.name}`}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                {isRoleActive(volunteer, "volunteer") ? (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => {
                      setDeactivatingId(volunteer.id);
                      setDeactivateError("");
                    }}
                    title={m.admin_volunteers_deactivate_title()}
                    aria-label={m.admin_volunteers_deactivate_title()}
                  >
                    <Icon icon={TrashIcon} />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleReactivate(volunteer.id)}
                    title={m.admin_volunteers_reactivate_title()}
                    aria-label={`${m.admin_volunteers_reactivate_title()}: ${volunteer.name}`}
                  >
                    <Icon icon={RotateCcwIcon} />
                  </Button>
                )}
              </div>
            );
          },
        }),
      ]),
    [
      setEditingVolunteer,
      setShowForm,
      setDeactivatingId,
      setDeactivateError,
      setConsentPerson,
      handleReactivate,
    ],
  );

  return (
    <>
      {consentPerson && (
        <PersonEmailConsents
          person={consentPerson}
          authHeaders={authHeaders}
          onClose={() => setConsentPerson(null)}
        />
      )}
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
          {reactivateSuccess && (
            <Alert
              variant="success"
              className="m-4 mb-0"
              onClose={() => setReactivateSuccess(false)}
            >
              {m.admin_volunteers_reactivate_success()}
            </Alert>
          )}
          {reactivateError && (
            <Alert variant="danger" className="m-4 mb-0" onClose={() => setReactivateError("")}>
              {reactivateError}
            </Alert>
          )}
          {deactivateSuccess && (
            <Alert
              variant="success"
              className="m-4 mb-0"
              onClose={() => setDeactivateSuccess(false)}
            >
              {m.admin_volunteers_deactivate_success()}
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

      {deactivatingId && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeactivatingId(null);
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle className="text-destructive">
                <Icon icon={TrashIcon} className="me-2" />
                {m.admin_volunteers_deactivate_title()}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              {deactivateError && <Alert variant="danger">{deactivateError}</Alert>}
              <p>{m.admin_volunteers_deactivate_confirm()}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDeactivatingId(null)}>
                {m.admin_action_cancel()}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeactivateConfirm}
                disabled={deactivating}
              >
                {deactivating ? <Spinner size="sm" /> : <Icon icon={TrashIcon} />}
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
