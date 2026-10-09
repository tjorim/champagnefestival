import { AdminField, AdminInput, AdminLabel } from "@/components/admin/AdminFields";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  createPollOption,
  deletePollOption,
  fetchEditionPollOptions,
  updatePollOption,
  type PollOption,
} from "@/utils/adminContentApi";
import { queryKeys } from "@/utils/queryKeys";
import type { Edition } from "./editionTypes";

interface EditionPollOptionsModalProps {
  show: boolean;
  edition: Edition | null;
  authHeaders: () => Record<string, string>;
  onHide: () => void;
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
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  const editionId = edition?.id ?? "";
  const queryKey = queryKeys.admin.editionPollOptions(editionId);

  const optionsQuery = useQuery({
    queryKey,
    queryFn: () => fetchEditionPollOptions(editionId, authHeaders),
    enabled: show && Boolean(editionId),
    staleTime: 0,
  });

  const addForm = useForm({
    defaultValues: { label: "" },
    onSubmit: async ({ value }) => {
      setError("");
      if (!value.label.trim()) {
        setError(m.admin_poll_label_required());
        return;
      }
      try {
        await createMutation.mutateAsync(value.label.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (label: string) => createPollOption({ editionId, label }, authHeaders),
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
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePollOption(id, authHeaders),
    retry: false,
  });

  const options = optionsQuery.data ?? [];

  async function handleSaveEdit() {
    if (!editing) return;
    setError("");
    if (!editing.label.trim()) {
      setError(m.admin_poll_label_required());
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: editing.id, label: editing.label.trim() });
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

  const totalQuantity = options.reduce((sum, option) => sum + option.totalQuantity, 0);

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
          <p className="text-sm text-subtle">{m.admin_poll_modal_description()}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          {optionsQuery.isPending ? (
            <div className="flex justify-center py-4">
              <Spinner label={m.admin_loading()} size="sm" />
            </div>
          ) : optionsQuery.isError ? (
            <Alert variant="danger">{m.admin_content_error_load()}</Alert>
          ) : options.length === 0 ? (
            <p className="text-sm text-subtle">{m.admin_poll_no_options()}</p>
          ) : (
            <>
              <PresentationList className="mb-2">
                {options.map((option) => (
                  <PresentationListItem key={option.id} className="flex items-center gap-2">
                    {editing?.id === option.id ? (
                      <>
                        <AdminInput
                          size="sm"
                          className="bg-muted text-content border-input"
                          aria-label={m.admin_poll_label_label()}
                          value={editing.label}
                          onChange={(e) =>
                            setEditing(
                              (previous) => previous && { ...previous, label: e.target.value },
                            )
                          }
                          maxLength={200}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="outline-primary"
                          disabled={updateMutation.isPending}
                          onClick={() => handleSaveEdit()}
                        >
                          {m.admin_save()}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                          {m.admin_action_cancel()}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="grow">{option.label}</span>
                        <Badge variant="secondary">
                          {m.admin_poll_ordered({
                            quantity: option.totalQuantity,
                            volunteers: option.volunteerCount,
                          })}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing({ id: option.id, label: option.label })}
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
              <p className="text-sm text-subtle">
                {m.admin_poll_total({ quantity: totalQuantity })}
              </p>
            </>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addForm.handleSubmit();
            }}
            className="flex gap-2 items-end flex-wrap border-t border-input pt-4"
          >
            <AdminField controlId="poll-option-add-label" className="grow">
              <AdminLabel className="text-sm text-subtle mb-1">
                {m.admin_poll_label_label()}
              </AdminLabel>
              <addForm.Field name="label">
                {(field) => (
                  <AdminInput
                    size="sm"
                    className="bg-muted text-content border-input"
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
