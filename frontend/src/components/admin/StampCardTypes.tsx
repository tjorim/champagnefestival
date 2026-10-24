import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import {
  stampKeys,
  stampRequest,
  stampTypeName,
  type StampCardType,
  type StampCardTypeWrite,
} from "@/utils/stampCards";
import { apiErrorMessage } from "@/utils/apiErrors";
import { queryKeys } from "@/utils/queryKeys";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminCheck,
  AdminSelect,
  AdminOption,
} from "./AdminFields";
import AdminEditorDialog from "./AdminEditorDialog";

const empty: StampCardTypeWrite = {
  name_nl: "",
  name_fr: null,
  name_en: null,
  reward_label_nl: "",
  reward_label_fr: null,
  reward_label_en: null,
  box_count: 10,
  active: true,
};

function TypeEditor({
  value,
  authHeaders,
  onClose,
}: {
  value: StampCardType | null;
  authHeaders: () => Record<string, string>;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const baseline = value ?? empty;
  const [draft, setDraft] = useState<StampCardTypeWrite>({ ...baseline });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const {
        name_nl,
        name_fr,
        name_en,
        reward_label_nl,
        reward_label_fr,
        reward_label_en,
        box_count,
        active,
      } = draft;
      await stampRequest(
        `/api/stamp-cards/types${value ? `/${encodeURIComponent(value.id)}` : ""}`,
        authHeaders,
        undefined,
        {
          name_nl,
          name_fr,
          name_en,
          reward_label_nl,
          reward_label_fr,
          reward_label_en,
          box_count,
          active,
        },
        value ? "PUT" : "POST",
      );
      await client.invalidateQueries({ queryKey: stampKeys.types });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, m.stamp_error()));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminEditorDialog
      title={value ? m.stamp_edit_type() : m.stamp_add_type()}
      busy={busy}
      dirty={JSON.stringify(draft) !== JSON.stringify(baseline)}
      onClose={onClose}
      footer={
        <Button type="submit" form="stamp-type-form" disabled={busy}>
          {m.admin_save()}
        </Button>
      }
    >
      <form
        id="stamp-type-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        {error && <Alert variant="danger">{error}</Alert>}
        {(["nl", "fr", "en"] as const).map((locale) => (
          <div className="grid gap-4 md:grid-cols-2" key={locale}>
            <AdminField>
              <AdminLabel>{m.stamp_name({ locale })}</AdminLabel>
              <AdminInput
                required={locale === "nl"}
                maxLength={200}
                value={draft[`name_${locale}`] ?? ""}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, [`name_${locale}`]: event.target.value || null })
                }
              />
            </AdminField>
            <AdminField>
              <AdminLabel>{m.stamp_reward_label({ locale })}</AdminLabel>
              <AdminInput
                required={locale === "nl"}
                maxLength={200}
                value={draft[`reward_label_${locale}`] ?? ""}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, [`reward_label_${locale}`]: event.target.value || null })
                }
              />
            </AdminField>
          </div>
        ))}
        <AdminField>
          <AdminLabel>{m.stamp_boxes()}</AdminLabel>
          <AdminInput
            type="number"
            min={1}
            max={1000000}
            step={1}
            required
            value={draft.box_count}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, box_count: Number(event.target.value) })}
          />
        </AdminField>
        <AdminCheck
          label={m.stamp_active()}
          checked={draft.active}
          disabled={busy}
          onCheckedChange={(active) => setDraft({ ...draft, active: active === true })}
        />
        <p className="text-sm text-subtle">{m.stamp_snapshot_note()}</p>
      </form>
    </AdminEditorDialog>
  );
}

export default function StampCardTypes({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const client = useQueryClient();
  const types = useQuery({
    queryKey: stampKeys.types,
    queryFn: ({ signal }) =>
      stampRequest<StampCardType[]>("/api/stamp-cards/types", authHeaders, signal),
  });
  const settings = useQuery({
    queryKey: queryKeys.admin.settings,
    queryFn: ({ signal }) =>
      stampRequest<{ stamp_card_type_id: string | null }>("/api/settings", authHeaders, signal),
  });
  const [editing, setEditing] = useState<StampCardType | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function selectType(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await stampRequest(
        "/api/settings",
        authHeaders,
        undefined,
        { stamp_card_type_id: id || null },
        "PUT",
      );
      await client.invalidateQueries({ queryKey: queryKeys.admin.settings });
    } catch (err) {
      setError(apiErrorMessage(err, m.stamp_error()));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card tone="secondary" className="mt-4">
      <CardHeader>{m.stamp_types()}</CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(types.isPending || settings.isPending) && <p role="status">{m.admin_loading()}</p>}
        {(error || types.isError || settings.isError) && (
          <Alert variant="danger">
            {error || apiErrorMessage(types.error ?? settings.error, m.stamp_error())}
            <Button
              variant="outline"
              onClick={() => {
                void types.refetch();
                void settings.refetch();
              }}
            >
              {m.admin_retry()}
            </Button>
          </Alert>
        )}
        {types.data && settings.data && (
          <>
            <AdminField>
              <AdminLabel>{m.stamp_default_type()}</AdminLabel>
              <AdminSelect
                value={settings.data.stamp_card_type_id ?? ""}
                disabled={busy}
                onValueChange={(id) => void selectType(id)}
              >
                <AdminOption value="">{m.stamp_no_default()}</AdminOption>
                {types.data.map((type) => (
                  <AdminOption key={type.id} value={type.id} disabled={!type.active}>
                    {stampTypeName(type)}
                    {!type.active ? ` (${m.stamp_inactive()})` : ""}
                  </AdminOption>
                ))}
              </AdminSelect>
            </AdminField>
            {settings.data.stamp_card_type_id &&
              !types.data.find((type) => type.id === settings.data?.stamp_card_type_id)?.active && (
                <Alert variant="warning">{m.stamp_default_inactive()}</Alert>
              )}
            {types.data.map((type) => (
              <div key={type.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {stampTypeName(type)} ({type.box_count})
                </span>
                <Badge variant={type.active ? "success" : "secondary"}>
                  {type.active ? m.stamp_active() : m.stamp_inactive()}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() => setEditing(type)}
                  aria-label={`${m.stamp_edit_type()}: ${stampTypeName(type)}`}
                >
                  {m.admin_edit()}
                </Button>
              </div>
            ))}
          </>
        )}
        <Button variant="outline-primary" onClick={() => setEditing(null)}>
          {m.stamp_add_type()}
        </Button>
        {editing !== undefined && (
          <TypeEditor
            value={editing}
            authHeaders={authHeaders}
            onClose={() => setEditing(undefined)}
          />
        )}
      </CardContent>
    </Card>
  );
}
