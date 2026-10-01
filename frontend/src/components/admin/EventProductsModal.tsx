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
import { m } from "@/paraglide/messages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
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
import type { OrderItemCategory } from "@/types/registration";

interface EventProductsModalProps {
  show: boolean;
  event: Event | null;
  authHeaders: () => Record<string, string>;
  onHide: () => void;
  onProductsChanged?: () => void;
}

interface ProductFormState {
  name: string;
  description: string;
  price: string;
  category: OrderItemCategory;
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
  name: "",
  description: "",
  price: "",
  category: "champagne",
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

function categoryLabel(category: OrderItemCategory): string {
  switch (category) {
    case "champagne":
      return m.admin_products_category_champagne();
    case "food":
      return m.admin_products_category_food();
    default:
      return m.admin_products_category_other();
  }
}

export default function EventProductsModal({
  show,
  event,
  authHeaders,
  onHide,
  onProductsChanged,
}: EventProductsModalProps) {
  const queryClient = useQueryClient();
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
            name: editingProduct.name,
            description: editingProduct.description,
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
        : EMPTY_FORM,
    [editingProduct],
  );

  const form = useForm({
    defaultValues: formDefaultValues,
    onSubmit: async ({ value }) => {
      setError("");
      if (!value.name.trim()) {
        setError(m.admin_products_name_required());
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
          name: value.name.trim(),
          description: value.description.trim(),
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
        className="border-top tw:border-input tw:pt-4 tw:mt-2"
      >
        <div className="tw:flex tw:gap-2 tw:flex-wrap tw:mb-2">
          <AdminField
            className="tw:min-w-50 tw:grow-2 tw:shrink-1 tw:basis-50"
            controlId="product-name"
          >
            <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
              {m.admin_products_name()}
            </AdminLabel>
            <form.Field name="name">
              {(field) => (
                <AdminInput
                  size="sm"
                  className="tw:bg-muted tw:text-content tw:border-input"
                  autoFocus
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>
          <AdminField
            className="tw:min-w-50 tw:grow-2 tw:shrink-1 tw:basis-50"
            controlId="product-description"
          >
            <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
              {m.admin_products_description()}
            </AdminLabel>
            <form.Field name="description">
              {(field) => (
                <AdminInput
                  size="sm"
                  className="tw:bg-muted tw:text-content tw:border-input"
                  maxLength={300}
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>
          <AdminField className="tw:max-w-30" controlId="product-price">
            <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
              {m.admin_products_price()}
            </AdminLabel>
            <form.Field name="price">
              {(field) => (
                <AdminInput
                  type="number"
                  min={0}
                  step="0.01"
                  size="sm"
                  className="tw:bg-muted tw:text-content tw:border-input"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>
          <AdminField className="tw:max-w-40" controlId="product-category">
            <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
              {m.admin_products_category()}
            </AdminLabel>
            <form.Field name="category">
              {(field) => (
                <AdminSelect
                  size="sm"
                  className="tw:bg-muted tw:text-content tw:border-input"
                  value={field.value}
                  onValueChange={(e) => field.handleChange(e as OrderItemCategory)}
                  onBlur={field.handleBlur}
                >
                  <AdminOption value="champagne">
                    {m.admin_products_category_champagne()}
                  </AdminOption>
                  <AdminOption value="food">{m.admin_products_category_food()}</AdminOption>
                  <AdminOption value="other">{m.admin_products_category_other()}</AdminOption>
                </AdminSelect>
              )}
            </form.Field>
          </AdminField>
        </div>

        <div className="tw:flex tw:flex-wrap tw:gap-6 tw:mb-1">
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
        <div className="tw:text-subtle tw:text-sm tw:mb-1">
          {m.admin_products_purchasable_help()}
        </div>
        <form.Subscribe selector={(s) => s.values.purchasable}>
          {(purchasable) => (
            <div className="tw:text-subtle tw:text-sm tw:mb-2">
              {purchasable
                ? m.admin_products_required_help()
                : m.admin_products_required_needs_purchasable()}
            </div>
          )}
        </form.Subscribe>

        <div className="tw:flex tw:gap-2 tw:flex-wrap tw:mb-2">
          <AdminField className="tw:max-w-40" controlId="product-unit">
            <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
              {m.admin_inventory_unit()}
            </AdminLabel>
            <form.Field name="unit">
              {(field) => (
                <AdminSelect
                  size="sm"
                  className="tw:bg-muted tw:text-content tw:border-input"
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
          <AdminField className="tw:max-w-40" controlId="product-stock">
            <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
              {m.admin_inventory_stock()}
            </AdminLabel>
            <form.Field name="stock">
              {(field) => (
                <AdminInput
                  type="number"
                  min={0}
                  step={1}
                  size="sm"
                  className="tw:bg-muted tw:text-content tw:border-input"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </AdminField>
        </div>
        <AdminDescription className="tw:block tw:mb-2">
          {m.admin_inventory_unlimited_help()}
        </AdminDescription>
        <fieldset className="tw:mb-4">
          <legend className="tw:text-base tw:font-medium tw:leading-tight">
            {m.admin_inventory_inclusions()}
          </legend>
          {inclusions.map((edge, index) => (
            <div className="tw:flex tw:flex-wrap tw:gap-2 tw:mb-2 tw:items-start" key={index}>
              <AdminSelect
                size="sm"
                className="tw:bg-muted tw:text-content tw:border-input tw:min-w-45 tw:grow-2 tw:shrink-1 tw:basis-45"

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
                className="tw:bg-muted tw:text-content tw:border-input tw:max-w-22.5"

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
                className="tw:bg-muted tw:text-content tw:border-input tw:max-w-22.5"

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
                className="tw:bg-muted tw:text-content tw:border-input tw:max-w-35"

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
          <AdminDescription className="tw:block tw:mb-2">
            {m.admin_inventory_ratio_help()}
          </AdminDescription>
          <AdminDescription className="tw:block tw:mb-2">
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
          <fieldset className="tw:mb-4">
            <legend className="tw:text-base tw:font-medium tw:leading-tight">
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

        <div className="tw:flex tw:gap-2 tw:justify-end">
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
        className="tw:flex tw:flex-col tw:gap-1 tw:py-1 tw:px-0 tw:text-card-foreground"
      >
        <div className="tw:flex tw:justify-between tw:items-center tw:gap-2">
          <span className="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2 tw:flex-wrap">
            <span className="tw:text-content">
              {product.name}
              <span className="tw:block tw:text-sm tw:text-subtle">
                {m.admin_inventory_reserved()} {product.reservedQuantity ?? 0} /{" "}
                {product.stock ?? m.admin_inventory_unlimited()}
                {(product.shortage ?? 0) > 0
                  ? ` — ${m.admin_inventory_shortage()}: ${product.shortage}`
                  : ""}
              </span>
            </span>
            <Badge
              variant={product.purchasable ? "success" : "secondary"}
              className="tw:text-micro"
            >
              {product.purchasable ? m.admin_products_purchasable() : m.admin_products_hidden()}
            </Badge>
            {soldOut && (
              <Badge variant="danger" className="tw:text-micro">
                {m.admin_products_sold_out()}
              </Badge>
            )}
            <Badge variant="secondary" className="tw:text-micro tw:capitalize">
              {categoryLabel(product.category)}
            </Badge>
            {product.required && (
              <Badge variant="warning" className="tw:text-micro">
                {m.admin_products_required_badge()}
              </Badge>
            )}
            <span className="tw:text-subtle tw:text-sm">€{product.price.toFixed(2)}</span>
          </span>
          <span className="tw:flex tw:gap-1 tw:shrink-0">
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
          <div className="tw:text-subtle tw:text-xs">
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
                className="border rounded tw:p-4 tw:mb-4"
                aria-label={m.admin_inventory_review()}
              >
                <h3 className="tw:text-base tw:font-medium tw:leading-tight">
                  {m.admin_inventory_review()}
                </h3>
                <p>
                  {preview.payload.name}: €{preview.payload.price.toFixed(2)};{" "}
                  {m.admin_inventory_stock()}:{" "}
                  {preview.payload.stock ?? m.admin_inventory_unlimited()}
                </p>
                {preview.result.bookings.map((b) => (
                  <div key={b.id} className="tw:mb-2">
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

            <p className="tw:text-subtle tw:text-sm tw:mb-4">{m.admin_products_help()}</p>

            {error && (
              <Alert variant="danger" className="tw:py-1 tw:mb-2">
                {error}
              </Alert>
            )}

            {productsQuery.isPending ? (
              <div className="tw:text-center tw:py-4">
                <Spinner label={m.admin_loading()} size="sm" variant="warning" />
              </div>
            ) : productsQuery.isError ? (
              <Alert variant="danger" className="tw:py-1 tw:mb-2">
                {m.admin_content_error_load()}
              </Alert>
            ) : (
              <>
                {products.length === 0 ? (
                  <p className="tw:text-subtle fst-italic tw:text-sm">{m.admin_products_empty()}</p>
                ) : (
                  <PresentationList flush className="tw:mb-2">
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
