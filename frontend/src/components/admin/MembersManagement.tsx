import { PeopleDataTable, PersonName } from "./PeopleDataTable";
import { Button } from "@/components/ui/button";
import { MailIcon, PencilIcon, TrashIcon } from "lucide-react";
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
import { apiErrorMessage } from "@/utils/apiErrors";
import type { Person } from "@/types/person";
import { createAppColumnHelper } from "@/hooks/useAdminTable";
import MemberFormModal, { type MemberFormData } from "./MemberFormModal";
import { buildMemberEmailDraft, type EmailDraft } from "@/utils/emailComposer";
import EmailComposeModal from "./EmailComposeModal";

interface MembersManagementProps {
  authHeaders: () => Record<string, string>;
  onCreate: (data: MemberFormData) => Promise<void>;
  onUpdate: (id: string, data: MemberFormData) => Promise<void>;
  onEnd: (id: string) => Promise<void>;
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
  onEnd,
  authHeaders,
}: MembersManagementProps) {
  const [createSuccess, setCreateSuccess] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [endSuccess, setEndSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState("");
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);

  const handleEndConfirm = async () => {
    if (!endingId) return;
    setEnding(true);
    setEndError("");
    try {
      await onEnd(endingId);
      setEndSuccess(true);
      setEndingId(null);
    } catch (err) {
      setEndError(apiErrorMessage(err, m.admin_members_error_end()));
    } finally {
      setEnding(false);
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
            return <PersonName person={member} />;
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
        columnHelper.accessor("clubName", {
          enableSorting: false,
          header: m.admin_people_club_name_label(),
          cell: ({ getValue }) => (
            <span className="text-sm">{String(getValue() ?? "") || "—"}</span>
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
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => {
                    setEndingId(member.id);
                    setEndError("");
                  }}
                  title={m.admin_members_end_title()}
                  aria-label={m.admin_members_end_title()}
                >
                  <Icon icon={TrashIcon} />
                </Button>
              </div>
            );
          },
        }),
      ]),
    [setEditingMember, setShowForm, setEndingId, setEndError],
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
          {endSuccess && (
            <Alert variant="success" className="m-4 mb-0" onClose={() => setEndSuccess(false)}>
              {m.admin_members_end_success()}
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

      {endingId && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open)
              (() => {
                if (!ending) setEndingId(null);
              })();
          }}
        >
          <DialogContent admin size="default">
            <DialogHeader>
              <DialogTitle>{m.admin_members_end_title()}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              {endError && (
                <Alert variant="danger" className="py-2 text-sm">
                  {endError}
                </Alert>
              )}
              <p>{m.admin_members_end_confirm()}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEndingId(null)} disabled={ending}>
                {m.admin_action_cancel()}
              </Button>
              <Button variant="danger" onClick={handleEndConfirm} disabled={ending}>
                {ending ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    {m.admin_delete()}
                  </>
                ) : (
                  <>
                    <Icon icon={TrashIcon} className="me-1" />
                    {m.admin_members_end_title()}
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
