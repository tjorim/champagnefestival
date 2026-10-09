import { AdminField, AdminLabel, AdminSelect, AdminOption } from "@/components/admin/AdminFields";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";

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
import {
  EMPTY_LOCALIZED_TEXT,
  LocalizedInputs,
  OriginalLanguageSelect,
  hasOriginal,
  type Language,
} from "@/components/admin/LocalizedFields";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  createPollOption,
  deletePollOption,
  fetchEditionPollOptions,
  updatePollOption,
  type PollOption,
  type PollOptionKind,
  type PollOptionLabels,
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
  const [editing, setEditing] = useState<({ id: string } & PollOptionLabels) | null>(null);

  const editionId = edition?.id ?? "";
  const queryKey = queryKeys.admin.editionPollOptions(editionId);

  const optionsQuery = useQuery({
    queryKey,
    queryFn: () => fetchEditionPollOptions(editionId, authHeaders),
    enabled: show && Boolean(editionId),
    staleTime: 0,
  });

  const addForm = useForm({
    defaultValues: {
      kind: "dish" as PollOptionKind,
      language: "nl" as Language,
      labels: EMPTY_LOCALIZED_TEXT,
    },
    onSubmit: async ({ value }) => {
      setError("");
      if (!hasOriginal(value.language, value.labels)) {
        setError(m.admin_poll_label_required());
        return;
      }
      try {
        await createMutation.mutateAsync(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : m.admin_content_error_save());
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: { kind: PollOptionKind } & PollOptionLabels) =>
      createPollOption({ editionId, ...payload }, authHeaders),
    retry: false,
    onSuccess: (created) => {
      queryClient.setQueryData<PollOption[]>(queryKey, (prev = []) => [...prev, created]);
      addForm.setFieldValue("labels", EMPTY_LOCALIZED_TEXT);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string } & PollOptionLabels) =>
      updatePollOption(payload.id, payload, authHeaders),
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
    if (!hasOriginal(editing.language, editing.labels)) {
      setError(m.admin_poll_label_required());
      return;
    }
    try {
      await updateMutation.mutateAsync(editing);
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
          <p className="text-sm text-subtle">{m.admin_poll_modal_description()}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          {optionsQuery.isPending ? (
            <div className="flex justify-center py-4">
              <Spinner label={m.admin_loading()} size="sm" />
            </div>
          ) : optionsQuery.isError ? (
            <Alert variant="danger">{m.admin_content_error_load()}</Alert>
          ) : (
            KINDS.map((kind) => {
              const kindOptions = options.filter((o) => o.kind === kind);
              return (
                <div key={kind} className="mb-6">
                  <h3 className="text-base font-medium leading-tight">{kindLabel(kind)}</h3>
                  {kindOptions.length === 0 ? (
                    <p className="text-sm text-subtle">{m.admin_poll_no_options()}</p>
                  ) : (
                    <PresentationList className="mb-2">
                      {kindOptions.map((option) => (
                        <PresentationListItem key={option.id} className="flex items-center gap-2">
                          {editing?.id === option.id ? (
                            <div className="grow">
                              <OriginalLanguageSelect
                                controlId={`poll-option-edit-language-${option.id}`}
                                label={m.admin_poll_original_language()}
                                value={editing.language}
                                onChange={(language) =>
                                  setEditing((previous) => previous && { ...previous, language })
                                }
                              />
                              <LocalizedInputs
                                idPrefix={`poll-option-edit-${option.id}`}
                                label={(language) => m.admin_poll_label_in({ language })}
                                values={editing.labels}
                                maxLength={200}
                                onChange={(language, text) =>
                                  setEditing(
                                    (previous) =>
                                      previous && {
                                        ...previous,
                                        labels: { ...previous.labels, [language]: text },
                                      },
                                  )
                                }
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline-primary"
                                  disabled={updateMutation.isPending}
                                  onClick={() => handleSaveEdit()}
                                >
                                  {m.admin_save()}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditing(null)}
                                >
                                  {m.admin_action_cancel()}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <span className="grow">{option.label}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditing({
                                    id: option.id,
                                    language: option.labelLanguage,
                                    labels: option.labels,
                                  });
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
            className="flex gap-2 items-end flex-wrap border-t border-input pt-4"
          >
            <AdminField controlId="poll-option-add-kind">
              <AdminLabel className="text-sm text-subtle mb-1">
                {m.admin_poll_add_kind_label()}
              </AdminLabel>
              <addForm.Field name="kind">
                {(field) => (
                  <AdminSelect
                    size="sm"
                    className="bg-muted text-content border-input"
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
            <addForm.Field name="language">
              {(field) => (
                <OriginalLanguageSelect
                  controlId="poll-option-add-language"
                  label={m.admin_poll_original_language()}
                  value={field.value}
                  onChange={(language) => field.handleChange(language)}
                />
              )}
            </addForm.Field>
            <p className="text-sm text-subtle w-full">{m.admin_poll_text_help()}</p>
            <addForm.Field name="labels">
              {(field) => (
                <div className="w-full">
                  <LocalizedInputs
                    idPrefix="poll-option-add-label"
                    label={(language) => m.admin_poll_label_in({ language })}
                    values={field.value}
                    maxLength={200}
                    onChange={(language, text) =>
                      field.handleChange({ ...field.value, [language]: text })
                    }
                  />
                </div>
              )}
            </addForm.Field>
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
