import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AdminField, AdminLabel, AdminInput } from "@/components/admin/AdminFields";
import { m } from "@/paraglide/messages";
import {
  addMissingBindings,
  validTemplate,
  type Template,
  type TemplateKind,
} from "../editorModel";
import AdminEditorDialog from "@/components/admin/AdminEditorDialog";
import { bindingLabels } from "./templateLabels";
import { useTemplateEditor } from "./useTemplateEditor";
import { TemplateWorkspace } from "./TemplateWorkspace";

interface TemplateEditorProps {
  template: Template | null;
  onClose: () => void;
  onSaved: (template: Template) => void;
  initialKind?: TemplateKind;
}

export function TemplateEditor({ template, onClose, onSaved, initialKind }: TemplateEditorProps) {
  const editor = useTemplateEditor({ template, onSaved, initialKind });
  const {
    initial,
    organizations,
    notices,
    change,
    undo,
    redo,
    save,
    samples,
    missing,
    fieldLabels,
    choose,
    draft,
    setSelected,
    past,
    future,
    kind,
    setKind,
    sample,
    setSample,
    error,
    busy,
  } = editor;
  return (
    <AdminEditorDialog
      title={template ? m.admin_edit_item({ name: template.name }) : m.signage_editor_new()}
      size="xl"
      busy={busy}
      dirty={JSON.stringify(draft) !== JSON.stringify(initial)}
      onClose={onClose}
      footer={
        <>
          {(!validTemplate(draft) || missing.length > 0) && (
            <p>{m.signage_template_requirements()}</p>
          )}
          <Button
            disabled={busy || !validTemplate(draft) || missing.length > 0}
            onClick={() => void save()}
          >
            {m.signage_editor_save()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {(error || organizations.error || notices.error) && (
          <Alert variant="danger">{error || m.admin_error_load_data()}</Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !past.length} onClick={undo}>
            {m.signage_editor_undo()}
          </Button>
          <Button disabled={busy || !future.length} onClick={redo}>
            {m.signage_editor_redo()}
          </Button>
        </div>
        <div className="grid items-start gap-3 md:grid-cols-3">
          <AdminField>
            <AdminLabel>{fieldLabels.name}</AdminLabel>
            <AdminInput
              maxLength={200}
              value={draft.name}
              disabled={busy}
              onChange={(event) => change({ ...draft, name: event.target.value })}
            />
          </AdminField>
          {choose(
            m.signage_editor_preview_kind(),
            kind,
            ["organizations", "notice", "image"],
            (value) => {
              setKind(value as TemplateKind);
              setSample("");
            },
            Boolean(initialKind),
            {
              organizations: m.signage_editor_organisations(),
              notice: m.signage_editor_notice(),
              image: m.signage_editor_image(),
            },
          )}
          {samples.length > 0 ? (
            choose(
              m.signage_editor_sample(),
              sample || String(samples[0]!.id),
              samples.map((item) => String(item.id)),
              setSample,
              false,
              Object.fromEntries(
                samples.map((item) => [
                  String(item.id),
                  "name" in item ? item.name : item.content.title || item.id,
                ]),
              ),
            )
          ) : (
            <AdminEmptyState>{m.signage_editor_no_samples()}</AdminEmptyState>
          )}
        </div>
        {missing.length > 0 && (
          <Alert>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {m.signage_editor_missing()} {missing.map((key) => bindingLabels()[key]).join(", ")}
              </span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const next = addMissingBindings(draft, kind);
                  if (JSON.stringify(next) !== JSON.stringify(draft)) change(next);
                  const first = next.layers.find(
                    (item) =>
                      item.kind === "binding" &&
                      missing.some((binding) => binding === item.binding) &&
                      item.visible !== false,
                  );
                  if (first) setSelected(first.id);
                }}
              >
                {m.signage_editor_add_missing()}
              </Button>
            </div>
          </Alert>
        )}
        <TemplateWorkspace editor={editor} />
      </div>
    </AdminEditorDialog>
  );
}
