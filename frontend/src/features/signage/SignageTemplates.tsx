import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { m } from "@/paraglide/messages";
import { type Template } from "./editorModel";
import { PencilIcon } from "lucide-react";
import { AdminAddButton, RowActionButton, RowActions } from "@/components/admin/RowActions";
import { TemplateEditor } from "./templates/TemplateEditor";

export default function SignageTemplates() {
  const [editing, setEditing] = useState<Template | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const templates = useQuery({
    queryKey: ["admin", "signage", "templates"],
    queryFn: ({ signal }) =>
      fetchJsonOrThrow<Template[]>("/api/signage/templates", { signal }, m.admin_error_load_data()),
  });
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{m.signage_editor_heading()}</h2>
      {templates.error && <Alert variant="danger">{m.admin_error_load_data()}</Alert>}
      {saved && <p role="status">{m.signage_editor_saved()}</p>}
      <AdminAddButton
        onClick={() => {
          setSaved(false);
          setEditing(null);
        }}
      >
        {m.signage_editor_new()}
      </AdminAddButton>
      <ul className="space-y-2">
        {templates.data?.map((template) => (
          <li key={template.id} className="flex items-center justify-between gap-2">
            <span>{template.name}</span>
            <RowActions>
              <RowActionButton
                icon={PencilIcon}
                label={m.admin_edit_item({ name: template.name })}
                onClick={() => {
                  setSaved(false);
                  setEditing(template);
                }}
              />
            </RowActions>
          </li>
        ))}
      </ul>
      {editing !== undefined && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setSaved(true);
            void templates.refetch();
          }}
        />
      )}
    </div>
  );
}
