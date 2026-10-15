import { PeopleDataTable, PersonName } from "./PeopleDataTable";
import { Button } from "@/components/ui/button";
import { MailIcon, PencilIcon, RotateCcwIcon, TrashIcon } from "lucide-react";
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
import { isRoleActive, roleSince, type Person } from "@/types/person";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import MemberFormModal, { type MemberFormData } from "./MemberFormModal";
import { buildMemberEmailDraft, type EmailDraft } from "@/utils/emailComposer";
import EmailComposeModal from "./EmailComposeModal";

interface MembersManagementProps {
  authHeaders: () => Record<string, string>;
  onCreate: (data: MemberFormData) => Promise<void>;
  onUpdate: (id: string, data: MemberFormData) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  onReactivate: (id: string) => Promise<void>;
}

const columnHelper = createAppColumnHelper<Person>();

function truncateText(value: string, limit = 80): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

export default function MembersManagement({
  onCreate,
  onUpdate,
  onDeactivate,
  onReactivate,
  authHeaders,
}: MembersManagementProps) {
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [deactivateSuccess, setDeactivateSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);
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
        setReactivateError(apiErrorMessage(err, m.admin_members_error_reactivate()));
      }
    },
    [onReactivate],
  );
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);

  const handleDeactivateConfirm = async () => {
    if (!deactivatingId) return;
    setDeactivating(true);
    setDeactivateError("");
    try {
      await onDeactivate(deactivatingId);
      setDeactivateSuccess(true);
      setDeactivatingId(null);
    } catch (err) {
      setDeactivateError(apiErrorMessage(err, m.admin_members_error_deactivate()));
    } finally {
      setDeactivating(false);
    }
  };

  const handleSaveMember = async (data: MemberFormData) => {
    if (editingMember) {
      await onUpdate(editingMember.id, data);
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
            const member = row.original;
            return <PersonName person={member} role="member" />;
          },
        }),
        columnHelper.accessor("email", {
          header: m.registration_email(),
          cell: ({ getValue }) => (
            <span className="text-sm">{String(getValue() ?? "") || "—"}</span>
          ),
        }),
        columnHelper.accessor("phone", {
          enableSorting: false,
          header: m.registration_phone(),
          cell: ({ getValue }) => (
            <span className="text-sm">{String(getValue() ?? "") || "—"}</span>
          ),
        }),
        columnHelper.display({
          id: "memberSince",
          header: m.admin_members_since_label(),
          enableSorting: false,
          cell: ({ row }) => (
            <span className="text-sm">{roleSince(row.original, "member") ?? "—"}</span>
          ),
        }),
        columnHelper.accessor("notes", {
          header: m.registration_notes(),
          enableSorting: false,
          cell: ({ row }) => {
            const notes = row.original.notes;
            const preview = truncateText(notes);
            return (
              <span className="text-sm text-subtle" title={notes || undefined}>
                {preview || "—"}
              </span>
            );
          },
        }),
        columnHelper.accessor((row) => row.registrationCount ?? 0, {
          id: "registrations",
          header: m.admin_registrations_tab(),
          cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span>,
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const member = row.original;
            return (
              <div className="flex flex-wrap gap-1">
                {member.email && (
                  <Button
                    size="sm"
                    variant="outline-warning"
                    onClick={() =>
                      setEmailDraft(
                        buildMemberEmailDraft(
                          member.name,
                          member.email,
                          member.preferredLanguage ?? "nl",
                        ),
                      )
                    }
                    title={m.admin_email_compose_for({ name: member.name })}
                    aria-label={m.admin_email_compose_for({ name: member.name })}
                  >
                    <Icon icon={MailIcon} />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingMember(member);
                    setShowForm(true);
                  }}
                  title={m.admin_members_edit_title()}
                  aria-label={`${m.admin_members_edit_title()}: ${member.name}`}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                {isRoleActive(member, "member") ? (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => {
                      setDeactivatingId(member.id);
                      setDeactivateError("");
                    }}
                    title={m.admin_members_deactivate_title()}
                    aria-label={m.admin_members_deactivate_title()}
                  >
                    <Icon icon={TrashIcon} />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleReactivate(member.id)}
                    title={m.admin_members_reactivate_title()}
                    aria-label={`${m.admin_members_reactivate_title()}: ${member.name}`}
                  >
                    <Icon icon={RotateCcwIcon} />
                  </Button>
                )}
              </div>
            );
          },
        }),
      ]),
    [setEditingMember, setShowForm, setDeactivatingId, setDeactivateError, handleReactivate],
  );

  return (
    <>
      <EmailComposeModal draft={emailDraft} onClose={() => setEmailDraft(null)} />
      <Card tone="secondary">
        <CardHeader>{m.admin_members_tab()}</CardHeader>

        <CardContent className="p-0">
          {createSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setCreateSuccess(false)}>
              {m.admin_members_create_success()}
            </Alert>
          )}
          {updateSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setUpdateSuccess(false)}>
              {m.admin_members_update_success()}
            </Alert>
          )}
          {reactivateSuccess && (
            <Alert
              variant="success"
              className="m-4 mb-0"
              onClose={() => setReactivateSuccess(false)}
            >
              {m.admin_members_reactivate_success()}
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
              {m.admin_members_deactivate_success()}
            </Alert>
          )}

          <PeopleDataTable
            id="members"
            authHeaders={authHeaders}
            columns={columns}
            onOpen={(person) => {
              setEditingMember(person);
              setShowForm(true);
            }}
            primaryAction={
              <Button
                variant="outline-primary"
                onClick={() => {
                  setEditingMember(null);
                  setShowForm(true);
                }}
              >
                {m.admin_members_add()}
              </Button>
            }
          />
        </CardContent>
      </Card>

      {deactivatingId && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open)
              (() => {
                if (!deactivating) setDeactivatingId(null);
              })();
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle>{m.admin_members_deactivate_title()}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              {deactivateError && (
                <Alert variant="danger" className="py-2 text-sm">
                  {deactivateError}
                </Alert>
              )}
              <p>{m.admin_members_deactivate_confirm()}</p>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeactivatingId(null)}
                disabled={deactivating}
              >
                {m.admin_action_cancel()}
              </Button>
              <Button variant="danger" onClick={handleDeactivateConfirm} disabled={deactivating}>
                {deactivating ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    {m.admin_delete()}
                  </>
                ) : (
                  <>
                    <Icon icon={TrashIcon} className="me-1" />
                    {m.admin_members_deactivate_title()}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <MemberFormModal
        show={showForm}
        member={editingMember}
        onSave={handleSaveMember}
        onHide={() => {
          setShowForm(false);
          setEditingMember(null);
        }}
      />
    </>
  );
}
