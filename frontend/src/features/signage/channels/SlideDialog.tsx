import { TemplateEditor } from "../templates/TemplateEditor";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminCheck,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { signageRequest, fetchJsonOrThrow } from "@/lib/api/adminApi";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { m } from "@/paraglide/messages";
import { type Template } from "../editorModel";
import { localSchedule, type SlideDraft } from "../playlistModel";
import { signageIcons } from "../icons";
import AdminEditorDialog from "@/components/admin/AdminEditorDialog";
import { type SignageChannelsEditor } from "./useSignageChannelsEditor";
import { Field } from "./ChannelParts";
import { PreviewControls } from "./PreviewControls";

interface SlideDialogProps {
  editor: SignageChannelsEditor;
}

/** The add/edit slide dialog. */
export function SlideDialog({ editor }: SlideDialogProps) {
  const {
    client,
    templates,
    kindLabels,
    orgLabels,
    label,
    compatible,
    valid,
    resetPreview,
    changeSlide,
    run,
    refresh,
    closeSlide,
    confirmRemove,
    queryError,
    slideInitial,
    slideId,
    setDraft,
    creatingTemplate,
    setCreatingTemplate,
    busy,
    error,
    setStatus,
  } = editor;
  const draft = editor.draft;
  if (!draft) return null;
  return (
    <AdminEditorDialog
      title={slideId ? m.signage_edit_slide() : m.signage_channels_add()}
      busy={busy}
      dirty={JSON.stringify(draft) !== JSON.stringify(slideInitial)}
      onClose={closeSlide}
      footer={
        <>
          {slideId && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmRemove("slides", slideId, label(draft))}
            >
              {m.signage_channels_delete_slide()}
            </Button>
          )}
          <Button form="signage-slide-form" type="submit" disabled={busy || !valid}>
            {m.signage_channels_save_slide()}
          </Button>
        </>
      }
    >
      {(error || queryError) && (
        <Alert variant="danger">
          {error || apiErrorMessage(queryError, m.admin_error_load_data())}
        </Alert>
      )}
      {creatingTemplate && (
        <TemplateEditor
          template={null}
          initialKind={draft.kind}
          onClose={() => setCreatingTemplate(false)}
          onSaved={(template) => {
            client.setQueryData<Template[]>(["admin", "signage", "templates"], (items) => [
              ...(items ?? []),
              template,
            ]);
            changeSlide({ ...draft, template_id: template.id });
            setCreatingTemplate(false);
            void templates.refetch();
          }}
        />
      )}
      <fieldset disabled={busy} className="space-y-4">
        <form
          id="signage-slide-form"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            void run(async () => {
              const { id: _id, ...body } = { ...draft, id: slideId };
              await signageRequest(
                `slides${slideId ? `/${slideId}` : ""}`,

                slideId ? "PUT" : "POST",
                body,
              );
              setDraft(null);
              resetPreview();
              await refresh();
              setStatus(m.signage_channels_saved());
            });
          }}
        >
          <Field label={m.signage_editor_kind()}>
            <AdminSelect
              value={draft.kind}
              onValueChange={(value) =>
                changeSlide({ ...draft, kind: value as SlideDraft["kind"], template_id: "" })
              }
            >
              {Object.entries(kindLabels).map(([key, text]) => (
                <AdminOption key={key} value={key}>
                  {text}
                </AdminOption>
              ))}
            </AdminSelect>
          </Field>
          {draft.kind === "organizations" && (
            <Field label={m.signage_channels_group()}>
              <AdminSelect
                value={draft.content.organization_type ?? ""}
                onValueChange={(value) =>
                  changeSlide({
                    ...draft,
                    content: {
                      ...draft.content,
                      organization_type: (value as "producer" | "vendor" | "sponsor") || null,
                    },
                  })
                }
              >
                <AdminOption value="">{m.signage_channels_all()}</AdminOption>
                {Object.entries(orgLabels).map(([key, text]) => (
                  <AdminOption key={key} value={key}>
                    {text}
                  </AdminOption>
                ))}
              </AdminSelect>
            </Field>
          )}
          <Field label={m.signage_channels_template()}>
            <AdminSelect
              value={draft.template_id}
              onValueChange={(value) => changeSlide({ ...draft, template_id: value ?? "" })}
            >
              <AdminOption value="">—</AdminOption>
              {compatible.map((item) => (
                <AdminOption key={item.id} value={item.id}>
                  {item.name}
                </AdminOption>
              ))}
            </AdminSelect>
          </Field>
          <p>{m.signage_channels_templates_help()}</p>
          <Button variant="outline" onClick={() => setCreatingTemplate(true)}>
            {m.signage_create_template_here()}
          </Button>
          <p>{m.signage_template_return_help()}</p>
          {!valid && <p role="status">{m.signage_slide_requirements()}</p>}
          <Field label={m.signage_channels_duration()}>
            <AdminInput
              required
              type="number"
              min={1}
              max={3600}
              step={1}
              value={draft.duration}
              onChange={(e) => changeSlide({ ...draft, duration: Number(e.target.value) })}
            />
          </Field>
          <AdminCheck
            label={m.signage_channels_slide_active()}
            checked={draft.active}
            onCheckedChange={(checked) => changeSlide({ ...draft, active: checked })}
          />
          {(["starts_at", "ends_at"] as const).map((key) => (
            <Field
              key={key}
              label={key === "starts_at" ? m.signage_channels_start() : m.signage_channels_end()}
            >
              <AdminInput
                type="datetime-local"
                value={localSchedule(draft[key])}
                onChange={(e) =>
                  changeSlide({
                    ...draft,
                    [key]: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
            </Field>
          ))}
          {draft.kind === "notice" && (
            <>
              <Field label={m.signage_editor_title()}>
                <AdminInput
                  maxLength={120}
                  value={draft.content.title ?? ""}
                  onChange={(e) =>
                    changeSlide({
                      ...draft,
                      content: { ...draft.content, title: e.target.value || null },
                    })
                  }
                />
              </Field>
              <Field label={m.signage_editor_text()}>
                <AdminTextarea
                  maxLength={500}
                  required
                  value={draft.content.text ?? ""}
                  onChange={(e) =>
                    changeSlide({
                      ...draft,
                      content: { ...draft.content, text: e.target.value || null },
                    })
                  }
                />
              </Field>
              <Field label={m.signage_editor_icon()}>
                <AdminSelect
                  value={draft.content.icon ?? ""}
                  onValueChange={(value) =>
                    changeSlide({
                      ...draft,
                      content: { ...draft.content, icon: value || null },
                    })
                  }
                >
                  <AdminOption value="">—</AdminOption>
                  {Object.keys(signageIcons).map((icon) => (
                    <AdminOption key={icon} value={icon}>
                      {icon}
                    </AdminOption>
                  ))}
                </AdminSelect>
              </Field>
            </>
          )}
          {draft.kind === "image" && (
            <Field label={m.signage_editor_upload()}>
              <AdminInput
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void run(async () => {
                    const data = new FormData();
                    data.append("file", file);
                    const result = await fetchJsonOrThrow<import("@/api-types").SignageAssetOut>(
                      "/api/signage/assets",
                      { method: "POST", body: data },
                      m.signage_channels_error(),
                    );
                    changeSlide({
                      ...draft,
                      content: { ...draft.content, image: result.url },
                    });
                  });
                }}
              />
            </Field>
          )}
        </form>
        <PreviewControls editor={editor} />
      </fieldset>
    </AdminEditorDialog>
  );
}
