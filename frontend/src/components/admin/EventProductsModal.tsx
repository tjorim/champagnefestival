import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminSelect,
  AdminOption,
  AdminCheck,
  AdminDescription,
} from "@/components/admin/AdminFields";
import { PencilIcon, PlusIcon, SaveIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  EMPTY_LOCALIZED_TEXT,
  LocalizedInputs,
  OriginalLanguageSelect,
  hasOriginal,
  type Language,
  type LocalizedText,
} from "@/components/admin/LocalizedFields";
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { categoryLabel, useProductCategories } from "@/hooks/useCategories";
import {
  deleteEventProduct,
  fetchEventProducts,
  saveEventProduct,
  previewEventProduct,
  type ProductWrite,
  type ProductChangePreview,
} from "@/utils/adminContentApi";
import { queryKeys } from "@/utils/queryKeys";
import type { Event, Product, ProductInclusion } from "@/types/event";

interface EventProductsModalProps {
  show: boolean;
  event: Event | null;
  authHeaders: () => Record<string, string>;
  onHide: () => void;
  onProductsChanged?: () => void;
}

interface ProductFormState {
  nameLanguage: Language;
  name: LocalizedText;
  descriptionLanguage: Language;
  description: LocalizedText;
  price: string;
  category: string;
  purchasable: boolean;
  required: boolean;
  /** Empty string means "no bundle". */
  includedProductId: string;
  includedPerGuests: string;
  unit: "item" | "table" | "person";
  stock: string;
  inclusions: ProductInclusion[];
  updateExistingContents: boolean;
  updateExistingPrices: boolean;
}

const EMPTY_FORM: ProductFormState = {
  nameLanguage: "nl",
  name: EMPTY_LOCALIZED_TEXT,
  descriptionLanguage: "nl",
  description: EMPTY_LOCALIZED_TEXT,
  price: "",
  category: "",
  purchasable: true,
  required: false,
  includedProductId: "",
  includedPerGuests: "",
  unit: "item",
  stock: "",
  inclusions: [],
  updateExistingContents: false,
  updateExistingPrices: false,
};

export default function EventProductsModal({
  show,
  event,
  authHeaders,
  onHide,
  onProductsChanged,
}: EventProductsModalProps) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useProductCategories();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState<{
    payload: ProductWrite;
    result: ProductChangePreview;
  } | null>(null);
  const [confirmShortage, setConfirmShortage] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);

  const eventId = event?.id ?? "";
  const productsQueryKey = queryKeys.admin.eventProducts(eventId);

  const productsQuery = useQuery({
    queryKey: productsQueryKey,
    queryFn: () => fetchEventProducts(eventId, authHeaders),
    enabled: show && Boolean(eventId),
    staleTime: 0,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ProductWrite) => saveEventProduct(payload, authHeaders),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteEventProduct(productId, authHeaders),
    retry: false,
  });

  function updateQueryData(saved: Product) {
    queryClient.setQueryData<Product[]>(productsQueryKey, (prev = []) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      return idx >= 0 ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
  }

  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [productsQuery.data],
  );
  const editingProduct = editingId ? (products.find((p) => p.id === editingId) ?? null) : null;

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EditionModal for the details.
  const formDefaultValues = useMemo(
    (): ProductFormState =>
      editingProduct
        ? {
            nameLanguage: editingProduct.nameLanguage,
            name: {
              nl: editingProduct.nameNl ?? "",
              fr: editingProduct.nameFr ?? "",
              en: editingProduct.nameEn ?? "",
            },
            descriptionLanguage: editingProduct.descriptionLanguage ?? editingProduct.nameLanguage,
            description: {
              nl: editingProduct.descriptionNl ?? "",
              fr: editingProduct.descriptionFr ?? "",
              en: editingProduct.descriptionEn ?? "",
            },
            price: String(editingProduct.price),
            category: editingProduct.category,
            purchasable: editingProduct.purchasable,
            required: editingProduct.required,
            includedProductId: editingProduct.includedProductId ?? "",
            includedPerGuests:
              editingProduct.includedPerGuests != null
                ? String(editingProduct.includedPerGuests)
                : "",
            unit: editingProduct.unit ?? "item",
            stock: editingProduct.stock == null ? "" : String(editingProduct.stock),
            inclusions:
              editingProduct.inclusions ??
              (editingProduct.includedProductId
                ? [
                    {
                      product_id: editingProduct.includedProductId,
                      quantity: 1,
                      per_quantity: editingProduct.includedPerGuests ?? 1,
                      rounding: "down",
                    },
                  ]
                : []),
            updateExistingContents: false,
            updateExistingPrices: false,
          }
        : { ...EMPTY_FORM, category: categories[0]?.key ?? "" },
    [editingProduct, categories],
  );

  const form = useForm({
    defaultValues: formDefaultValues,
    onSubmit: async ({ value }) => {
      setError("");
      if (!hasOriginal(value.nameLanguage, value.name)) {
        setError(m.admin_products_name_required());
        return;
      }
      if (!value.category) {
        setError(m.admin_product_category_required());
        return;
      }
      const priceText = value.price.trim();
      const price = Number(priceText);
      if (!priceText || !Number.isFinite(price) || price < 0) {
        setError(m.admin_products_price_invalid());
        return;
      }
      const stock = value.stock.trim() === "" ? null : Number(value.stock);
      if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0)) {
        setError(m.admin_inventory_stock_invalid());
        return;
      }
      try {
        const payload: ProductWrite = {
          eventId,
          id: editingId ?? undefined,
          nameLanguage: value.nameLanguage,
          name: value.name,
          descriptionLanguage: value.descriptionLanguage,
          description: value.description,
          price,
          category: value.category,
          purchasable: value.purchasable,
          required: value.required,
          unit: value.unit,
          stock,
          inclusions: value.inclusions,
          updateExistingContents: value.updateExistingContents,
          updateExistingPrices: value.updateExistingPrices,
        };
        if (editingId) {
          setPreviewPending(true);
          const result = await previewEventProduct(payload, authHeaders);
          setPreviewPending(false);
          setConfirmShortage(false);
          setPreview({ payload, result });
          return;
        }
        const saved = await saveMutation.mutateAsync(payload);
        updateQueryData(saved);
        setFormOpen(false);
        setEditingId(null);
        onProductsChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : m.admin_content_error_save());
      } finally {
        setPreviewPending(false);
      }
    },
  });
  const inclusions = useSelector(form.atom, (s) => s.values.inclusions);

  // Clear local state once the modal closes, rather than in an effect (the
  // "adjusting state when a prop changes" pattern) since this only needs to
  // react to the show=true->false transition, not to every render.
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (!show) {
      setFormOpen(false);
      setPreview(null);
      setEditingId(null);
      setError("");
    }
  }

  // Seed the inline form from the record it's opened for. Reset during render
  // (the same "adjusting state when a prop changes" pattern) since this only
  // needs to react to the formOpen=false->true transition, not to every render —
  // see VolunteerFormModal for why the reset value must match `formDefaultValues`.
  const [wasFormOpen, setWasFormOpen] = useState(formOpen);
  if (formOpen !== wasFormOpen) {
    setWasFormOpen(formOpen);
    if (formOpen) form.reset(formDefaultValues);
  }

  // Any product can be a bundle target, purchasable or hidden — the server
  // only checks the complete graph for cycles.
  const bundleCandidates = products.filter((p) => p.id !== editingId);

  function openAdd() {
    setPreview(null);
    setEditingId(null);
    setFormOpen(true);
    setError("");
  }

  function openEdit(product: Product) {
    setPreview(null);
    setEditingId(product.id);
    setFormOpen(true);
    setError("");
  }

  async function handleDelete(product: Product) {
    const confirmed = await confirm({
      title: m.admin_products_delete_title(),
      body: m.admin_products_delete_confirm({ name: product.name }),
      errorFallback: m.admin_error_delete_product(),
    });
    if (!confirmed) return;
    setError("");
    try {
      await deleteMutation.mutateAsync(product.id);
      queryClient.setQueryData<Product[]>(productsQueryKey, (prev = []) =>
        prev.filter((p) => p.id !== product.id),
      );
      onProductsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  function renderForm() {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
        className="border-t border-input pt-4 mt-2"
      >
        <form.Field name="nameLanguage">
          {(field) => (
            <OriginalLanguageSelect
              controlId="product-name-language"
              label={m.admin_products_name_language()}
              value={field.value}
              onChange={(language) => field.handleChange(language)}
            />
          )}
        </form.Field>
        <p className="text-sm text-subtle mb-4">{m.admin_products_text_help()}</p>
        <form.Field name="name">
          {(field) => (
            <LocalizedInputs
              idPrefix="product-name"
              label={(language) => m.admin_products_name_in({ language })}
              values={field.value}
              onChange={(language, text) =>
                field.handleChange({ ...field.value, [language]: text })
              }
            />
          )}
        </form.Field>
        <form.Field name="descriptionLanguage">
          {(field) => (
            <OriginalLanguageSelect
              controlId="product-description-language"
              label={m.admin_products_description_language()}
              value={field.value}
              onChange={(language) => field.handleChange(language)}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <LocalizedInputs
              idPrefix="product-description"
              label={(language) => m.admin_products_description_in({ language })}
              values={field.value}
              maxLength={300}
              onChange={(language, text) =>
                field.handleChange({ ...field.value, [language]: text })
              }
            />
          )}
        </form.Field>
        <div className="flex gap-2 flex-wrap mb-2">
          <AdminField className="max-w-30" controlId="product-price">
            <AdminLabel className="text-subtle text-sm mb-1">{m.admin_products_price()}</AdminLabel>
            <form.Field name="price">
              {(field) => (
                <AdminInput
                  type="number"
                  min={0}
                  step="0.01"
                  size="sm"
                  className="bg-muted text-content border-input"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>
          <AdminField className="max-w-40" controlId="product-category">
            <AdminLabel className="text-subtle text-sm mb-1">
              {m.admin_products_category()}
            </AdminLabel>
            <form.Field name="category">
              {(field) => (
                <AdminSelect
                  size="sm"
                  className="bg-muted text-content border-input"
                  value={field.value}
                  onValueChange={(e) => field.handleChange(e)}
                  onBlur={field.handleBlur}
                >
                  {categories.map((category) => (
                    <AdminOption key={category.key} value={category.key}>
                      {categoryLabel(categories, category.key) ?? category.key}
                    </AdminOption>
                  ))}
                </AdminSelect>
              )}
            </form.Field>
          </AdminField>
        </div>

        <div className="flex flex-wrap gap-6 mb-1">
          <form.Field name="purchasable">
            {(field) => (
              <AdminCheck
                type="checkbox"
                id="product-purchasable"
                label={m.admin_products_purchasable_label()}
                checked={field.value}
                onCheckedChange={(e) => {
                  const purchasable = e;
                  field.handleChange(purchasable);
                  if (!purchasable) form.setFieldValue("required", false);
                }}
              />
            )}
          </form.Field>
          <form.Field name="required">
            {(field) => (
              <form.Subscribe selector={(s) => s.values.purchasable}>
                {(purchasable) => (
                  <AdminCheck
                    type="checkbox"
                    id="product-required"
                    label={m.admin_products_required_label()}
                    checked={field.value}
                    disabled={!purchasable}
                    onCheckedChange={(e) => field.handleChange(e)}
                  />
                )}
              </form.Subscribe>
            )}
          </form.Field>
        </div>
        <div className="text-subtle text-sm mb-1">{m.admin_products_purchasable_help()}</div>
        <form.Subscribe selector={(s) => s.values.purchasable}>
          {(purchasable) => (
            <div className="text-subtle text-sm mb-2">
              {purchasable
                ? m.admin_products_required_help()
                : m.admin_products_required_needs_purchasable()}
            </div>
          )}
        </form.Subscribe>

        <div className="flex gap-2 flex-wrap mb-2">
          <AdminField className="max-w-40" controlId="product-unit">
            <AdminLabel className="text-subtle text-sm mb-1">{m.admin_inventory_unit()}</AdminLabel>
            <form.Field name="unit">
              {(field) => (
                <AdminSelect
                  size="sm"
                  className="bg-muted text-content border-input"
                  value={field.value}
                  onValueChange={(e) => field.handleChange(e as ProductFormState["unit"])}
                  onBlur={field.handleBlur}
                >
                  <AdminOption value="item">{m.admin_inventory_unit_item()}</AdminOption>
                  <AdminOption value="person">{m.admin_inventory_unit_person()}</AdminOption>
                  <AdminOption value="table">{m.admin_inventory_unit_table()}</AdminOption>
                </AdminSelect>
              )}
            </form.Field>
          </AdminField>
          <AdminField className="max-w-40" controlId="product-stock">
            <AdminLabel className="text-subtle text-sm mb-1">
              {m.admin_inventory_stock()}
            </AdminLabel>
            <form.Field name="stock">
              {(field) => (
                <AdminInput
                  type="number"
                  min={0}
                  step={1}
                  size="sm"
                  className="bg-muted text-content border-input"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>
        </div>
        <AdminDescription className="block mb-2">
          {m.admin_inventory_unlimited_help()}
        </AdminDescription>
        <fieldset className="mb-4">
          <legend className="text-base font-medium leading-tight">
            {m.admin_inventory_inclusions()}
          </legend>
          {inclusions.map((edge, index) => (
            <div className="flex flex-wrap gap-2 mb-2 items-start" key={index}>
              <AdminSelect
                size="sm"
                className="bg-muted text-content border-input min-w-45 grow-2 shrink-1 basis-45"

                aria-label={m.admin_products_bundle_target()}
                value={edge.product_id}
                onValueChange={(e) =>
                  form.setFieldValue(`inclusions[${index}]`, {
                    ...edge,
                    product_id: e,
                  })
                }
              >
                <AdminOption value="">{m.admin_products_bundle_none()}</AdminOption>
                {bundleCandidates.map((p) => (
                  <AdminOption value={p.id} key={p.id}>
                    {p.name}
                  </AdminOption>
                ))}
              </AdminSelect>
              <AdminInput
                type="number"
                min={1}
                step={1}
                size="sm"
                className="bg-muted text-content border-input max-w-22.5"

                aria-label={m.admin_inventory_included_quantity()}
                value={edge.quantity}
                onChange={(e) =>
                  form.setFieldValue(`inclusions[${index}]`, {
                    ...edge,
                    quantity: Number(e.target.value),
                  })
                }
              />
              <AdminInput
                type="number"
                min={1}
                step={1}
                size="sm"
                className="bg-muted text-content border-input max-w-22.5"

                aria-label={m.admin_inventory_per_quantity()}
                value={edge.per_quantity}
                onChange={(e) =>
                  form.setFieldValue(`inclusions[${index}]`, {
                    ...edge,
                    per_quantity: Number(e.target.value),
                  })
                }
              />
              <AdminSelect
                size="sm"
                className="bg-muted text-content border-input max-w-35"

                aria-label={m.admin_inventory_rounding()}
                value={edge.rounding}
                onValueChange={(e) =>
                  form.setFieldValue(`inclusions[${index}]`, {
                    ...edge,
                    rounding: e as "up" | "down",
                  })
                }
              >
                <AdminOption value="down">{m.admin_inventory_round_down()}</AdminOption>
                <AdminOption value="up">{m.admin_inventory_round_up()}</AdminOption>
              </AdminSelect>
              <Button
                type="button"
                size="sm"
                variant="outline-danger"
                onClick={() => void form.removeFieldValue("inclusions", index)}
              >
                {m.admin_inventory_remove()}
              </Button>
            </div>
          ))}
          <AdminDescription className="block mb-2">
            {m.admin_inventory_ratio_help()}
          </AdminDescription>
          <AdminDescription className="block mb-2">
            {m.admin_inventory_hidden_target_help()}
          </AdminDescription>
          <Button
            type="button"
            onClick={() =>
              form.pushFieldValue("inclusions", {
                product_id: "",
                quantity: 1,
                per_quantity: 1,
                rounding: "down",
              })
            }
          >
            {m.admin_inventory_add_inclusion()}
          </Button>
        </fieldset>
        {editingId && (
          <fieldset className="mb-4">
            <legend className="text-base font-medium leading-tight">
              {m.admin_inventory_existing_bookings()}
            </legend>
            <form.Field name="updateExistingContents">
              {(field) => (
                <AdminCheck
                  id="update-booked-contents"
                  label={m.admin_inventory_update_contents()}
                  checked={field.value}
                  onCheckedChange={(e) => field.handleChange(e)}
                />
              )}
            </form.Field>
            <form.Field name="updateExistingPrices">
              {(field) => (
                <AdminCheck
                  id="update-booked-prices"
                  label={m.admin_inventory_update_prices()}
                  checked={field.value}
                  onCheckedChange={(e) => field.handleChange(e)}
                />
              )}
            </form.Field>
            <AdminDescription>{m.admin_inventory_keep_help()}</AdminDescription>
          </fieldset>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
            {m.close()}
          </Button>
          <Button
            type="submit"
            variant="warning"
            size="sm"
            disabled={saveMutation.isPending || previewPending}
          >
            <Icon icon={SaveIcon} />
            {m.admin_save()}
          </Button>
        </div>
      </form>
    );
  }

  function renderRow(product: Product) {
    const includedTarget = product.includedProductId
      ? products.find((p) => p.id === product.includedProductId)
      : undefined;
    const soldOut = product.purchasable && product.soldOut;
    const isBeingEdited = formOpen && editingId === product.id;
    return (
      <PresentationListItem
        key={product.id}
        className="flex flex-col gap-1 py-1 px-0 text-card-foreground"
      >
        <div className="flex justify-between items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
            <span className="text-content">
              {product.name}
              <span className="block text-sm text-subtle">
                {m.admin_inventory_reserved()} {product.reservedQuantity ?? 0} /{" "}
                {product.stock ?? m.admin_inventory_unlimited()}
                {(product.shortage ?? 0) > 0
                  ? ` — ${m.admin_inventory_shortage()}: ${product.shortage}`
                  : ""}
              </span>
            </span>
            <Badge variant={product.purchasable ? "success" : "secondary"} className="text-micro">
              {product.purchasable ? m.admin_products_purchasable() : m.admin_products_hidden()}
            </Badge>
            {soldOut && (
              <Badge variant="danger" className="text-micro">
                {m.admin_products_sold_out()}
              </Badge>
            )}
            <Badge variant="secondary" className="text-micro capitalize">
              {categoryLabel(categories, product.category) ?? product.category}
            </Badge>
            {product.required && (
              <Badge variant="warning" className="text-micro">
                {m.admin_products_required_badge()}
              </Badge>
            )}
            <span className="text-subtle text-sm">€{product.price.toFixed(2)}</span>
          </span>
          <span className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openEdit(product)}
              disabled={formOpen && !isBeingEdited}
              aria-label={`Edit ${product.name}`}
            >
              <Icon icon={PencilIcon} />
            </Button>
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => handleDelete(product)}
              disabled={formOpen}
              aria-label={`${m.admin_delete()} ${product.name}`}
            >
              <Icon icon={TrashIcon} />
            </Button>
          </span>
        </div>
        {includedTarget && product.includedPerGuests && (
          <div className="text-subtle text-xs">
            {m.admin_products_bundle_note({
              target: includedTarget.name,
              ratio: product.includedPerGuests,
            })}
          </div>
        )}
        {isBeingEdited && !preview && renderForm()}
      </PresentationListItem>
    );
  }

  return (
    <>
      <Dialog
        open={show}
        onOpenChange={(open) => {
          if (!open) onHide();
        }}
      >
        <DialogContent admin size="lg">
          <DialogHeader>
            <DialogTitle>{m.admin_products_title({ event: event?.title ?? "" })}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {preview && (
              <section
                className="rounded-md border border-border p-4 mb-4"
                aria-label={m.admin_inventory_review()}
              >
                <h3 className="text-base font-medium leading-tight">
                  {m.admin_inventory_review()}
                </h3>
                <p>
                  {preview.payload.name[preview.payload.nameLanguage]}: €
                  {preview.payload.price.toFixed(2)}; {m.admin_inventory_stock()}:{" "}
                  {preview.payload.stock ?? m.admin_inventory_unlimited()}
                </p>
                {preview.result.bookings.map((b) => (
                  <div key={b.id} className="mb-2">
                    <strong>{b.id}</strong>: €{b.before_total} → €{b.after_total};{" "}
                    {m.admin_inventory_paid()} €{b.amount_paid}; {m.admin_inventory_refund()} €
                    {b.refund_due}
                    <div>
                      {b.before_items.map((i) => `${i.name}: ${i.quantity}`).join(", ")} →{" "}
                      {b.after_items.map((i) => `${i.name}: ${i.quantity}`).join(", ")}
                    </div>
                  </div>
                ))}
                {preview.result.shortages.map((s, i) => (
                  <Alert variant="warning" key={i}>
                    {s.name}: {m.admin_inventory_reserved()} {s.reserved} / {s.stock};{" "}
                    {m.admin_inventory_shortage()} {s.shortage}
                  </Alert>
                ))}
                {preview.result.shortages.length > 0 && (
                  <AdminCheck
                    id="confirm-stock-shortage"
                    label={m.admin_inventory_confirm_shortage()}
                    checked={confirmShortage}
                    onCheckedChange={(e) => setConfirmShortage(e)}
                  />
                )}
                <Button
                  disabled={
                    saveMutation.isPending ||
                    (preview.result.shortages.length > 0 && !confirmShortage)
                  }
                  onClick={async () => {
                    try {
                      const saved = await saveMutation.mutateAsync({
                        ...preview.payload,
                        previewToken: preview.result.preview_token,
                        confirmShortage,
                      });
                      updateQueryData(saved);
                      setPreview(null);
                      setFormOpen(false);
                      setEditingId(null);
                      onProductsChanged?.();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : m.admin_content_error_save());
                      setPreview(null);
                    }
                  }}
                >
                  {m.admin_save()}
                </Button>
                <Button variant="outline" onClick={() => setPreview(null)}>
                  {m.close()}
                </Button>
              </section>
            )}

            <p className="text-subtle text-sm mb-4">{m.admin_products_help()}</p>

            {error && (
              <Alert variant="danger" className="py-1 mb-2">
                {error}
              </Alert>
            )}

            {productsQuery.isPending ? (
              <div className="text-center py-4">
                <Spinner label={m.admin_loading()} size="sm" variant="warning" />
              </div>
            ) : productsQuery.isError ? (
              <Alert variant="danger" className="py-1 mb-2">
                {m.admin_content_error_load()}
              </Alert>
            ) : (
              <>
                {products.length === 0 ? (
                  <p className="text-subtle italic text-sm">{m.admin_products_empty()}</p>
                ) : (
                  <PresentationList flush className="mb-2">
                    {products.map((product) => renderRow(product))}
                  </PresentationList>
                )}
              </>
            )}

            {formOpen && editingId === null && !preview ? (
              renderForm()
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={openAdd}
                disabled={productsQuery.isPending || productsQuery.isError || formOpen}
              >
                <Icon icon={PlusIcon} />
                {m.admin_products_add()}
              </Button>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onHide}>
              {m.close()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
