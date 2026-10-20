import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { AdminEmptyState } from "./AdminEmptyState";
import { AdminCheck, AdminField, AdminInput, AdminLabel } from "@/components/admin/AdminFields";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { m } from "@/paraglide/messages";
import {
  createPollOption,
  DIETARY_TAGS,
  deletePollOption,
  reorderPollOptions,
  updatePollOption,
  type PollOption,
  type PollOptionWrite,
  type PollQuestion,
} from "@/utils/adminContentApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import { dietaryTagLabel } from "@/utils/dietaryTags";

const EMPTY_WRITE: PollOptionWrite = { labelNl: "", labelFr: "", labelEn: "", dietaryTags: [] };

const LABEL_FIELDS = [
  { field: "labelNl", language: m.admin_language_nl },
  { field: "labelFr", language: m.admin_language_fr },
  { field: "labelEn", language: m.admin_language_en },
] as const;

function toWrite(option: PollOption): PollOptionWrite {
  return {
    labelNl: option.labelNl,
    labelFr: option.labelFr ?? "",
    labelEn: option.labelEn ?? "",
    dietaryTags: option.dietaryTags,
  };
}

/** The label inputs (Dutch required, French and English optional) and dietary tags of one option. */
function OptionFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: PollOptionWrite;
  onChange: (next: PollOptionWrite) => void;
}) {
  return (
    <div className="grow flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {LABEL_FIELDS.map(({ field, language }) => (
          <AdminField key={field} controlId={`${idPrefix}-${field}`} className="grow basis-40">
            <AdminLabel className="text-sm text-subtle mb-1">
              {m.admin_poll_label_in({ language: language() })}
            </AdminLabel>
            <AdminInput
              size="sm"
              className="bg-muted text-content border-input"
              value={value[field]}
              maxLength={200}
              onChange={(event) => onChange({ ...value, [field]: event.target.value })}
            />
          </AdminField>
        ))}
      </div>
      <fieldset className="flex gap-4 flex-wrap items-center border-0 p-0 m-0">
        <legend className="text-sm text-subtle">{m.admin_poll_dietary_label()}</legend>
        {DIETARY_TAGS.map((tag) => (
          <AdminCheck
            key={tag}
            id={`${idPrefix}-tag-${tag}`}
            label={dietaryTagLabel(tag)}
            checked={value.dietaryTags.includes(tag)}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                dietaryTags: checked
                  ? [...value.dietaryTags, tag]
                  : value.dietaryTags.filter((existing) => existing !== tag),
              })
            }
          />
        ))}
      </fieldset>
    </div>
  );
}

interface PollOptionsEditorProps {
  question: PollQuestion;
  authHeaders: () => Record<string, string>;
  /** The question's options changed (created, edited, deleted or reordered). */
  onOptionsChange: (options: PollOption[]) => void;
}

/** The meal options of one ``meals`` question: add, edit, order and delete them. */
export default function PollOptionsEditor({
  question,
  authHeaders,
  onOptionsChange,
}: PollOptionsEditorProps) {
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<PollOptionWrite>(EMPTY_WRITE);
  const [editing, setEditing] = useState<{ id: string; write: PollOptionWrite } | null>(null);
  const options = question.options;

  async function run(operation: () => Promise<unknown>) {
    setError("");
    try {
      await operation();
    } catch (err) {
      setError(apiErrorMessage(err, m.admin_content_error_save()));
    }
  }

  const createMutation = useMutation({
    mutationFn: (write: PollOptionWrite) =>
      createPollOption({ questionId: question.id, ...write }, authHeaders),
    retry: false,
    onSuccess: (created) => {
      onOptionsChange([...options, created]);
      setDraft(EMPTY_WRITE);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; write: PollOptionWrite }) =>
      updatePollOption(payload.id, payload.write, authHeaders),
    retry: false,
    onSuccess: (updated) => {
      onOptionsChange(options.map((o) => (o.id === updated.id ? updated : o)));
      setEditing(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (option: PollOption) =>
      deletePollOption(option.id, authHeaders, option.volunteerCount > 0),
    retry: false,
  });
  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderPollOptions(question.id, orderedIds, authHeaders),
    retry: false,
    onSuccess: onOptionsChange,
  });
  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;

  function handleAdd() {
    if (!draft.labelNl.trim()) {
      setError(m.admin_poll_label_required());
      return;
    }
    void run(() => createMutation.mutateAsync(draft));
  }

  function handleSaveEdit() {
    if (!editing) return;
    if (!editing.write.labelNl.trim()) {
      setError(m.admin_poll_label_required());
      return;
    }
    void run(() => updateMutation.mutateAsync(editing));
  }

  async function handleDelete(option: PollOption) {
    const confirmed = await confirm({
      title: m.admin_poll_delete_title(),
      body:
        option.volunteerCount > 0
          ? m.admin_poll_delete_body_in_use({
              label: option.label,
              volunteers: option.volunteerCount,
              quantity: option.totalQuantity,
            })
          : m.admin_poll_delete_body({ label: option.label }),
      errorFallback: m.admin_content_error_save(),
      variant: "danger",
    });
    if (!confirmed) return;
    await run(async () => {
      await deleteMutation.mutateAsync(option);
      onOptionsChange(options.filter((o) => o.id !== option.id));
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    const ids = options.map((o) => o.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => reorderMutation.mutateAsync(ids));
  }

  const totalQuantity = options.reduce((sum, option) => sum + option.totalQuantity, 0);

  return (
    <div>
      {error && <Alert variant="danger">{error}</Alert>}
      {options.length === 0 ? (
        <AdminEmptyState>{m.admin_poll_no_options()}</AdminEmptyState>
      ) : (
        <>
          <PresentationList className="mb-2">
            {options.map((option, index) => (
              <PresentationListItem key={option.id} className="flex items-center gap-2">
                {editing?.id === option.id ? (
                  <>
                    <OptionFields
                      idPrefix={`poll-edit-${option.id}`}
                      value={editing.write}
                      onChange={(write) => setEditing({ id: option.id, write })}
                    />
                    <Button
                      size="sm"
                      variant="outline-primary"
                      disabled={updateMutation.isPending}
                      onClick={handleSaveEdit}
                    >
                      {m.admin_save()}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                      {m.admin_action_cancel()}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col">
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 text-content"
                        disabled={index === 0 || busy}
                        onClick={() => handleMove(index, -1)}
                        aria-label={m.admin_poll_move_up({ label: option.label })}
                        title={m.admin_poll_move_up({ label: option.label })}
                      >
                        <Icon icon={ChevronUpIcon} />
                      </Button>
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 text-content"
                        disabled={index === options.length - 1 || busy}
                        onClick={() => handleMove(index, 1)}
                        aria-label={m.admin_poll_move_down({ label: option.label })}
                        title={m.admin_poll_move_down({ label: option.label })}
                      >
                        <Icon icon={ChevronDownIcon} />
                      </Button>
                    </div>
                    <div className="grow">
                      <span>{option.label}</span>
                      {option.dietaryTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="ms-2">
                          {dietaryTagLabel(tag)}
                        </Badge>
                      ))}
                      {(option.labelFr || option.labelEn) && (
                        <div className="text-sm text-subtle">
                          {[option.labelFr, option.labelEn].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <Badge variant="secondary">
                      {m.admin_poll_ordered({
                        quantity: option.totalQuantity,
                        volunteers: option.volunteerCount,
                      })}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ id: option.id, write: toWrite(option) })}
                    >
                      {m.admin_edit()}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={deleteMutation.isPending}
                      onClick={() => void handleDelete(option)}
                    >
                      {m.admin_delete()}
                    </Button>
                  </>
                )}
              </PresentationListItem>
            ))}
          </PresentationList>
          <p className="text-sm text-subtle">{m.admin_poll_total({ quantity: totalQuantity })}</p>
        </>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleAdd();
        }}
        className="flex gap-2 items-end flex-wrap border-t border-input pt-4"
      >
        <OptionFields idPrefix={`poll-add-${question.id}`} value={draft} onChange={setDraft} />
        <Button
          type="submit"
          size="sm"
          variant="outline-primary"
          disabled={createMutation.isPending}
        >
          {m.admin_poll_add_button()}
        </Button>
      </form>
      {confirmDialog}
    </div>
  );
}
