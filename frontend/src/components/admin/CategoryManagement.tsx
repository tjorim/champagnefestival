/**
 * CategoryManagement — CRUD for the categories events or products are filed under.
 *
 * Self-contained like FaqManagement. The key is chosen once and stays (events
 * and products store it); labels follow the organisation pattern: the original
 * language is required, the other languages are optional and fall back to it. A
 * category that is still in use cannot be deleted, which the server enforces.
 */

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminField,
  AdminInput,
  AdminLabel,
  AdminOption,
  AdminSelect,
} from "@/components/admin/AdminFields";
import { Icon } from "@/components/Icon";
import { eventCategoriesQueryOptions, productCategoriesQueryOptions } from "@/hooks/useCategories";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { m } from "@/paraglide/messages";
import type { EventLanguage } from "@/types/event";
import type { Category } from "@/types/category";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { invalidateAdmin } from "@/utils/queryInvalidation";

export type CategoryKind = "event" | "product";

/** What differs between the two kinds: the endpoint, the cached list and the wording. */
const KINDS = {
  event: {
    path: "/api/event-categories",
    queryOptions: eventCategoriesQueryOptions,
    section: () => m.admin_event_categories_section(),
    keyHelp: () => m.admin_event_category_key_help(),
    empty: () => m.admin_no_event_categories(),
    deleteConfirm: (label: string) => m.admin_event_category_delete_confirm({ label }),
  },
  product: {
    path: "/api/product-categories",
    queryOptions: productCategoriesQueryOptions,
    section: () => m.admin_product_categories_section(),
    keyHelp: () => m.admin_product_category_key_help(),
    empty: () => m.admin_no_product_categories(),
    deleteConfirm: (label: string) => m.admin_product_category_delete_confirm({ label }),
  },
} as const;

const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,49}$/;

const LANGUAGES = [
  { language: "nl", field: "labelNl", name: m.admin_language_nl },
  { language: "fr", field: "labelFr", name: m.admin_language_fr },
  { language: "en", field: "labelEn", name: m.admin_language_en },
] as const;

interface CategoryForm {
  key: string;
  labelLanguage: EventLanguage;
  labelNl: string;
  labelFr: string;
  labelEn: string;
  sortOrder: string;
}

const EMPTY_FORM: CategoryForm = {
  key: "",
  labelLanguage: "nl",
  labelNl: "",
  labelFr: "",
  labelEn: "",
  sortOrder: "0",
};

function toForm(category: Category): CategoryForm {
  return {
    key: category.key,
    labelLanguage: category.labelLanguage,
    labelNl: category.labelNl ?? "",
    labelFr: category.labelFr ?? "",
    labelEn: category.labelEn ?? "",
    sortOrder: String(category.sortOrder),
  };
}

/** Blank translations are sent as `null`, which clears them on update. */
function labelBody(form: CategoryForm) {
  return {
    label_language: form.labelLanguage,
    label_nl: form.labelNl.trim() || null,
    label_fr: form.labelFr.trim() || null,
    label_en: form.labelEn.trim() || null,
    sort_order: Number(form.sortOrder) || 0,
  };
}

export default function CategoryManagement({
  kind,
  authHeaders,
}: {
  kind: CategoryKind;
  authHeaders: () => Record<string, string>;
}) {
  const config = KINDS[kind];
  const queryClient = useQueryClient();
  const query = useQuery(config.queryOptions);
  const categories = query.data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });

  const saveMutation = useMutation({
    mutationFn: ({ editing, data }: { editing: string | null; data: CategoryForm }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        editing ? `${config.path}/${encodeURIComponent(editing)}` : config.path,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(editing ? labelBody(data) : { key: data.key, ...labelBody(data) }),
        },
        m.admin_error_save_category(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [config.queryOptions.queryKey]),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `${config.path}/${encodeURIComponent(key)}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_category(),
      ),
    onSettled: () => void invalidateAdmin(queryClient, [config.queryOptions.queryKey]),
    retry: false,
  });

  const openAdd = useCallback(() => {
    setEditingKey(null);
    setForm({ ...EMPTY_FORM, sortOrder: String((categories.at(-1)?.sortOrder ?? 0) + 10) });
    setError(null);
    setShowModal(true);
  }, [categories]);

  const openEdit = useCallback((category: Category) => {
    setEditingKey(category.key);
    setForm(toForm(category));
    setError(null);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    const original = LANGUAGES.find(({ language }) => language === form.labelLanguage);
    if (!editingKey && !KEY_PATTERN.test(form.key)) {
      setError(m.admin_category_key_invalid());
      return;
    }
    if (!original || !form[original.field].trim()) {
      setError(m.admin_category_label_required());
      return;
    }
    setError(null);
    try {
      await saveMutation.mutateAsync({ editing: editingKey, data: form });
      setShowModal(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : m.admin_error_save_category());
    }
  }, [form, editingKey, saveMutation]);

  const handleDelete = useCallback(
    async (category: Category) => {
      const confirmed = await confirm({
        title: m.admin_category_delete_title(),
        body: config.deleteConfirm(category.label),
        errorFallback: m.admin_error_delete_category(),
      });
      if (!confirmed) return;
      setRowError(null);
      try {
        await deleteMutation.mutateAsync(category.key);
      } catch (failure) {
        setRowError(failure instanceof Error ? failure.message : m.admin_error_delete_category());
      }
    },
    [confirm, config, deleteMutation],
  );

  const busy = saveMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <Card tone="secondary">
        <CardHeader className="flex items-center justify-between">
          <span className="font-semibold">{config.section()}</span>
          <Button variant="outline-warning" size="sm" onClick={openAdd}>
            <Icon icon={PlusIcon} />
            {m.admin_add_category()}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rowError && (
            <Alert variant="danger" className="m-4 py-1 text-sm">
              {rowError}
            </Alert>
          )}
          {query.isError ? (
            <Alert variant="danger" className="m-4 py-1 text-sm">
              {m.admin_error_load_data()}
            </Alert>
          ) : query.isPending ? (
            <div className="text-center py-12">
              <Spinner size="sm" role="status">
                <span className="sr-only">{m.admin_loading()}</span>
              </Spinner>
            </div>
          ) : categories.length === 0 ? (
            <p className="text-subtle text-center py-6 mb-0">{config.empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.admin_category_key()}</TableHead>
                  {LANGUAGES.map(({ language, name }) => (
                    <TableHead key={language}>{name()}</TableHead>
                  ))}
                  <TableHead>{m.admin_category_sort_order()}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.key}>
                    <TableCell className="font-mono text-sm">{category.key}</TableCell>
                    {LANGUAGES.map(({ language, field }) => (
                      <TableCell key={language}>{category[field] ?? "—"}</TableCell>
                    ))}
                    <TableCell>{category.sortOrder}</TableCell>
                    <TableCell className="w-px whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => openEdit(category)}
                          aria-label={`${m.admin_edit()} ${category.key}`}
                          title={m.admin_edit()}
                        >
                          <Icon icon={PencilIcon} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          disabled={busy}
                          onClick={() => handleDelete(category)}
                          aria-label={`${m.admin_delete()} ${category.key}`}
                          title={m.admin_delete()}
                        >
                          <Icon icon={TrashIcon} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          if (!open) setShowModal(false);
        }}
      >
        <DialogContent admin size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingKey ? m.admin_edit_category() : m.admin_add_category()}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {error && (
              <Alert variant="danger" className="py-1 mb-4 text-sm">
                {error}
              </Alert>
            )}
            <AdminField className="mb-4" controlId={`${kind}-category-key`}>
              <AdminLabel>{m.admin_category_key()}</AdminLabel>
              <AdminInput
                type="text"
                value={form.key}
                readOnly={Boolean(editingKey)}
                maxLength={50}
                onChange={(e) => setForm((previous) => ({ ...previous, key: e.target.value }))}
                className="bg-muted text-content border-input"
              />
              <p className="text-sm text-subtle mt-1 mb-0">{config.keyHelp()}</p>
            </AdminField>
            <AdminField className="mb-4 max-w-60" controlId={`${kind}-category-label-language`}>
              <AdminLabel>{m.admin_category_label_language()}</AdminLabel>
              <AdminSelect
                value={form.labelLanguage}
                onValueChange={(value) =>
                  setForm((previous) => ({ ...previous, labelLanguage: value as EventLanguage }))
                }
              >
                {LANGUAGES.map(({ language, name }) => (
                  <AdminOption key={language} value={language}>
                    {name()}
                  </AdminOption>
                ))}
              </AdminSelect>
            </AdminField>
            {LANGUAGES.map(({ language, field, name }) => (
              <AdminField
                key={language}
                className="mb-4"
                controlId={`${kind}-category-label-${language}`}
              >
                <AdminLabel>{m.admin_category_label({ language: name() })}</AdminLabel>
                <AdminInput
                  type="text"
                  value={form[field]}
                  maxLength={100}
                  onChange={(e) =>
                    setForm((previous) => ({ ...previous, [field]: e.target.value }))
                  }
                  className="bg-muted text-content border-input"
                />
              </AdminField>
            ))}
            <AdminField className="max-w-40" controlId={`${kind}-category-sort-order`}>
              <AdminLabel>{m.admin_category_sort_order()}</AdminLabel>
              <AdminInput
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((previous) => ({ ...previous, sortOrder: e.target.value }))
                }
                className="bg-muted text-content border-input"
              />
            </AdminField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
              {m.close()}
            </Button>
            <Button variant="warning" size="sm" disabled={busy} onClick={() => void handleSave()}>
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
