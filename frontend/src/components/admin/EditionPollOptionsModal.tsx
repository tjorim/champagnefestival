import {
  AdminInput,
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
} from "@/components/admin/AdminFields";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";

import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  createPollOption,
  deletePollOption,
  fetchEditionPollOptions,
  updatePollOption,
  type PollOption,
  type PollOptionKind,
} from "@/utils/adminContentApi";
import { queryKeys } from "@/utils/queryKeys";
import type { Edition } from "./editionTypes";

interface EditionPollOptionsModalProps {
  show: boolean;
  edition: Edition | null;
  authHeaders: () => Record<string, string>;
  onHide: () => void;
}

const KINDS: PollOptionKind[] = ["dish", "soup", "dinner"];

function kindLabel(kind: PollOptionKind): string {
  switch (kind) {
    case "dish":
      return m.admin_poll_kind_dish();
    case "soup":
      return m.admin_poll_kind_soup();
    default:
      return m.admin_poll_kind_dinner();
  }
}

export default function EditionPollOptionsModal({
  show,
  edition,
  authHeaders,
  onHide,
}: EditionPollOptionsModalProps) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const editionId = edition?.id ?? "";
  const queryKey = queryKeys.admin.editionPollOptions(editionId);

  const optionsQuery = useQuery({
    queryKey,
    queryFn: () => fetchEditionPollOptions(editionId, authHeaders),
    enabled: show && Boolean(editionId),
    staleTime: 0,
  });

  const addForm = useForm({
    defaultValues: { label: "", kind: "dish" as PollOptionKind },
    onSubmit: async ({ value }) => {
      setError("");
      if (!value.label.trim()) return;
      try {
        await createMutation.mutateAsync({ kind: value.kind, label: value.label.trim() });
      } catch (err) {
        setError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: { kind: PollOptionKind; label: string }) =>
      createPollOption({ editionId, kind: payload.kind, label: payload.label }, authHeaders),
    retry: false,
    onSuccess: (created) => {
      queryClient.setQueryData<PollOption[]>(queryKey, (prev = []) => [...prev, created]);
      addForm.setFieldValue("label", "");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; label: string }) =>
      updatePollOption(payload.id, payload.label, authHeaders),
    retry: false,
    onSuccess: (updated) => {
      queryClient.setQueryData<PollOption[]>(queryKey, (prev = []) =>
        prev.map((o) => (o.id === updated.id ? updated : o)),
      );
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePollOption(id, authHeaders),
    retry: false,
  });

  const options = optionsQuery.data ?? [];

  async function handleSaveEdit(id: string) {
    setError("");
    if (!editingLabel.trim()) return;
    try {
      await updateMutation.mutateAsync({ id, label: editingLabel.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  async function handleDelete(option: PollOption) {
    const confirmed = await confirm({
      title: m.admin_poll_delete_title(),
      body: m.admin_poll_delete_body({ label: option.label }),
      errorFallback: m.admin_content_error_save(),
      variant: "danger",
    });
    if (!confirmed) return;
    setError("");
    try {
      await deleteMutation.mutateAsync(option.id);
      queryClient.setQueryData<PollOption[]>(queryKey, (prev = []) =>
        prev.filter((o) => o.id !== option.id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>{m.admin_poll_modal_title({ edition: edition?.id ?? "" })}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="tw:text-sm tw:text-subtle">{m.admin_poll_modal_description()}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          {optionsQuery.isPending ? (
            <div className="tw:flex tw:justify-center tw:py-4">
              <Spinner animation="border" size="sm" />
            </div>
          ) : optionsQuery.isError ? (
            <Alert variant="danger">{m.admin_content_error_load()}</Alert>
          ) : (
            KINDS.map((kind) => {
              const kindOptions = options.filter((o) => o.kind === kind);
              return (
                <div key={kind} className="tw:mb-6">
                  <h3 className="tw:text-base tw:font-medium tw:leading-tight">
                    {kindLabel(kind)}
                  </h3>
                  {kindOptions.length === 0 ? (
                    <p className="tw:text-sm tw:text-subtle">{m.admin_poll_no_options()}</p>
                  ) : (
                    <PresentationList className="tw:mb-2">
                      {kindOptions.map((option) => (
                        <PresentationListItem
                          key={option.id}
                          className="tw:flex tw:items-center tw:gap-2"
                        >
                          {editingId === option.id ? (
                            <>
                              <AdminInput
                                size="sm"
                                className="tw:bg-muted tw:text-content tw:border-input"
                                value={editingLabel}
                                onChange={(e) => setEditingLabel(e.target.value)}
                                maxLength={200}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="outline-primary"
                                disabled={updateMutation.isPending}
                                onClick={() => handleSaveEdit(option.id)}
                              >
                                {m.admin_save()}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => setEditingId(null)}
                              >
                                {m.admin_action_cancel()}
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="tw:grow">{option.label}</span>
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => {
                                  setEditingId(option.id);
                                  setEditingLabel(option.label);
                                }}
                              >
                                {m.admin_edit()}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                disabled={deleteMutation.isPending}
                                onClick={() => handleDelete(option)}
                              >
                                {m.admin_delete()}
                              </Button>
                            </>
                          )}
                        </PresentationListItem>
                      ))}
                    </PresentationList>
                  )}
                </div>
              );
            })
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addForm.handleSubmit();
            }}
            className="tw:flex tw:gap-2 tw:items-end tw:flex-wrap border-top tw:border-input tw:pt-4"
          >
            <AdminField controlId="poll-option-add-kind">
              <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
                {m.admin_poll_add_kind_label()}
              </AdminLabel>
              <addForm.Field name="kind">
                {(field) => (
                  <AdminSelect
                    size="sm"
                    className="tw:bg-muted tw:text-content tw:border-input"
                    value={field.value}
                    onValueChange={(e) => field.handleChange(e as PollOptionKind)}
                  >
                    {KINDS.map((kind) => (
                      <AdminOption key={kind} value={kind}>
                        {kindLabel(kind)}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                )}
              </addForm.Field>
            </AdminField>
            <AdminField controlId="poll-option-add-label" className="tw:grow">
              <AdminLabel className="tw:text-sm tw:text-subtle tw:mb-1">
                {m.admin_poll_add_label_label()}
              </AdminLabel>
              <addForm.Field name="label">
                {(field) => (
                  <AdminInput
                    size="sm"
                    className="tw:bg-muted tw:text-content tw:border-input"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    maxLength={200}
                  />
                )}
              </addForm.Field>
            </AdminField>
            <Button
              type="submit"
              size="sm"
              variant="outline-primary"
              disabled={createMutation.isPending}
            >
              {m.admin_poll_add_button()}
            </Button>
          </form>
        </DialogBody>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
