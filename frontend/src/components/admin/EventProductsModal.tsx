import { useMemo, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
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
  const { confirm, confirmDialog } = useConfirmDialog();
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
  const inclusions = useStore(form.store, (s) => s.values.inclusions);

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
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
        className="border-top border-secondary pt-3 mt-2"
      >
        <div className="d-flex gap-2 flex-wrap mb-2">
          <Form.Group style={{ minWidth: "200px", flex: "2 1 200px" }} controlId="product-name">
            <Form.Label className="text-secondary small mb-1">{m.admin_products_name()}</Form.Label>
            <form.Field name="name">
              {(field) => (
                <Form.Control
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  autoFocus
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>
          <Form.Group
            style={{ minWidth: "200px", flex: "2 1 200px" }}
            controlId="product-description"
          >
            <Form.Label className="text-secondary small mb-1">
              {m.admin_products_description()}
            </Form.Label>
            <form.Field name="description">
              {(field) => (
                <Form.Control
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  maxLength={300}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>
          <Form.Group style={{ maxWidth: "120px" }} controlId="product-price">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_products_price()}
            </Form.Label>
            <form.Field name="price">
              {(field) => (
                <Form.Control
                  type="number"
                  min={0}
                  step="0.01"
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>
          <Form.Group style={{ maxWidth: "160px" }} controlId="product-category">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_products_category()}
            </Form.Label>
            <form.Field name="category">
              {(field) => (
                <Form.Select
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value as OrderItemCategory)}
                  onBlur={field.handleBlur}
                >
                  <option value="champagne">{m.admin_products_category_champagne()}</option>
                  <option value="food">{m.admin_products_category_food()}</option>
                  <option value="other">{m.admin_products_category_other()}</option>
                </Form.Select>
              )}
            </form.Field>
          </Form.Group>
        </div>

        <div className="d-flex flex-wrap gap-4 mb-1">
          <form.Field name="purchasable">
            {(field) => (
              <Form.Check
                type="checkbox"
                id="product-purchasable"
                label={m.admin_products_purchasable_label()}
                checked={field.state.value}
                onChange={(e) => {
                  const purchasable = e.target.checked;
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
                  <Form.Check
                    type="checkbox"
                    id="product-required"
                    label={m.admin_products_required_label()}
                    checked={field.state.value}
                    disabled={!purchasable}
                    onChange={(e) => field.handleChange(e.target.checked)}
                  />
                )}
              </form.Subscribe>
            )}
          </form.Field>
        </div>
        <div className="text-secondary small mb-1">{m.admin_products_purchasable_help()}</div>
        <form.Subscribe selector={(s) => s.values.purchasable}>
          {(purchasable) => (
            <div className="text-secondary small mb-2">
              {purchasable
                ? m.admin_products_required_help()
                : m.admin_products_required_needs_purchasable()}
            </div>
          )}
        </form.Subscribe>

        <div className="d-flex gap-2 flex-wrap mb-2">
          <Form.Group style={{ maxWidth: "160px" }} controlId="product-unit">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_inventory_unit()}
            </Form.Label>
            <form.Field name="unit">
              {(field) => (
                <Form.Select
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value as ProductFormState["unit"])}
                  onBlur={field.handleBlur}
                >
                  <option value="item">{m.admin_inventory_unit_item()}</option>
                  <option value="person">{m.admin_inventory_unit_person()}</option>
                  <option value="table">{m.admin_inventory_unit_table()}</option>
                </Form.Select>
              )}
            </form.Field>
          </Form.Group>
          <Form.Group style={{ maxWidth: "160px" }} controlId="product-stock">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_inventory_stock()}
            </Form.Label>
            <form.Field name="stock">
              {(field) => (
                <Form.Control
                  type="number"
                  min={0}
                  step={1}
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>
        </div>
        <Form.Text className="d-block mb-2">{m.admin_inventory_unlimited_help()}</Form.Text>
        <fieldset className="mb-3">
          <legend className="h6">{m.admin_inventory_inclusions()}</legend>
          {inclusions.map((edge, index) => (
            <div className="d-flex flex-wrap gap-2 mb-2 align-items-start" key={index}>
              <Form.Select
                size="sm"
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "180px", flex: "2 1 180px" }}
                aria-label={m.admin_products_bundle_target()}
                value={edge.product_id}
                onChange={(e) =>
                  void form.replaceFieldValue("inclusions", index, {
                    ...edge,
                    product_id: e.target.value,
                  })
                }
              >
                <option value="">{m.admin_products_bundle_none()}</option>
                {bundleCandidates.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </Form.Select>
              <Form.Control
                type="number"
                min={1}
                step={1}
                size="sm"
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: "90px" }}
                aria-label={m.admin_inventory_included_quantity()}
                value={edge.quantity}
                onChange={(e) =>
                  void form.replaceFieldValue("inclusions", index, {
                    ...edge,
                    quantity: Number(e.target.value),
                  })
                }
              />
              <Form.Control
                type="number"
                min={1}
                step={1}
                size="sm"
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: "90px" }}
                aria-label={m.admin_inventory_per_quantity()}
                value={edge.per_quantity}
                onChange={(e) =>
                  void form.replaceFieldValue("inclusions", index, {
                    ...edge,
                    per_quantity: Number(e.target.value),
                  })
                }
              />
              <Form.Select
                size="sm"
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: "140px" }}
                aria-label={m.admin_inventory_rounding()}
                value={edge.rounding}
                onChange={(e) =>
                  void form.replaceFieldValue("inclusions", index, {
                    ...edge,
                    rounding: e.target.value as "up" | "down",
                  })
                }
              >
                <option value="down">{m.admin_inventory_round_down()}</option>
                <option value="up">{m.admin_inventory_round_up()}</option>
              </Form.Select>
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
          <Form.Text className="d-block mb-2">{m.admin_inventory_ratio_help()}</Form.Text>
          <Form.Text className="d-block mb-2">{m.admin_inventory_hidden_target_help()}</Form.Text>
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
          <fieldset className="mb-3">
            <legend className="h6">{m.admin_inventory_existing_bookings()}</legend>
            <form.Field name="updateExistingContents">
              {(field) => (
                <Form.Check
                  id="update-booked-contents"
                  label={m.admin_inventory_update_contents()}
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                />
              )}
            </form.Field>
            <form.Field name="updateExistingPrices">
              {(field) => (
                <Form.Check
                  id="update-booked-prices"
                  label={m.admin_inventory_update_prices()}
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                />
              )}
            </form.Field>
            <Form.Text>{m.admin_inventory_keep_help()}</Form.Text>
          </fieldset>
        )}

        <div className="d-flex gap-2 justify-content-end">
          <Button variant="outline-secondary" size="sm" onClick={() => setFormOpen(false)}>
            {m.close()}
          </Button>
          <Button
            type="submit"
            variant="warning"
            size="sm"
            disabled={saveMutation.isPending || previewPending}
          >
            <i className="bi bi-floppy me-1" aria-hidden="true" />
            {m.admin_save()}
          </Button>
        </div>
      </Form>
    );
  }

  function renderRow(product: Product) {
    const includedTarget = product.includedProductId
      ? products.find((p) => p.id === product.includedProductId)
      : undefined;
    const soldOut = product.purchasable && product.soldOut;
    const isBeingEdited = formOpen && editingId === product.id;
    return (
      <ListGroup.Item
        key={product.id}
        className="bg-dark border-secondary d-flex flex-column gap-1 py-1 px-0 text-light"
      >
        <div className="d-flex justify-content-between align-items-center gap-2">
          <span className="d-flex align-items-center gap-2 text-truncate flex-wrap">
            <span className="text-light">
              {product.name}
              <span className="d-block small text-secondary">
                {m.admin_inventory_reserved()} {product.reservedQuantity ?? 0} /{" "}
                {product.stock ?? m.admin_inventory_unlimited()}
                {(product.shortage ?? 0) > 0
                  ? ` — ${m.admin_inventory_shortage()}: ${product.shortage}`
                  : ""}
              </span>
            </span>
            <Badge bg={product.purchasable ? "success" : "secondary"} className="fs-3xs">
              {product.purchasable ? m.admin_products_purchasable() : m.admin_products_hidden()}
            </Badge>
            {soldOut && (
              <Badge bg="danger" className="fs-3xs">
                {m.admin_products_sold_out()}
              </Badge>
            )}
            <Badge bg="secondary" className="fs-3xs text-capitalize">
              {categoryLabel(product.category)}
            </Badge>
            {product.required && (
              <Badge bg="warning" text="dark" className="fs-3xs">
                {m.admin_products_required_badge()}
              </Badge>
            )}
            <span className="text-secondary small">€{product.price.toFixed(2)}</span>
          </span>
          <span className="d-flex gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => openEdit(product)}
              disabled={formOpen && !isBeingEdited}
              aria-label={`Edit ${product.name}`}
            >
              <i className="bi bi-pencil" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => handleDelete(product)}
              disabled={formOpen}
              aria-label={`${m.admin_delete()} ${product.name}`}
            >
              <i className="bi bi-trash" aria-hidden="true" />
            </Button>
          </span>
        </div>
        {includedTarget && product.includedPerGuests && (
          <div className="text-secondary" style={{ fontSize: "0.75rem" }}>
            {m.admin_products_bundle_note({
              target: includedTarget.name,
              ratio: product.includedPerGuests,
            })}
          </div>
        )}
        {isBeingEdited && !preview && renderForm()}
      </ListGroup.Item>
    );
  }

  return (
    <>
      <Modal
        show={show}
        onHide={onHide}
        centered
        size="lg"
        data-bs-theme="dark"
        dialogClassName="admin-dialog"
      >
        <Modal.Header closeButton className="bg-dark border-secondary">
          <Modal.Title className="text-warning fs-6">
            {m.admin_products_title({ event: event?.title ?? "" })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark">
          {preview && (
            <section className="border rounded p-3 mb-3" aria-label={m.admin_inventory_review()}>
              <h3 className="h6">{m.admin_inventory_review()}</h3>
              <p>
                {preview.payload.name}: €{preview.payload.price.toFixed(2)};{" "}
                {m.admin_inventory_stock()}:{" "}
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
                <Form.Check
                  id="confirm-stock-shortage"
                  label={m.admin_inventory_confirm_shortage()}
                  checked={confirmShortage}
                  onChange={(e) => setConfirmShortage(e.target.checked)}
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
              <Button variant="outline-secondary" onClick={() => setPreview(null)}>
                {m.close()}
              </Button>
            </section>
          )}

          <p className="text-secondary small mb-3">{m.admin_products_help()}</p>

          {error && (
            <Alert variant="danger" className="py-1 mb-2">
              {error}
            </Alert>
          )}

          {productsQuery.isPending ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" variant="warning" />
            </div>
          ) : productsQuery.isError ? (
            <Alert variant="danger" className="py-1 mb-2">
              {m.admin_content_error_load()}
            </Alert>
          ) : (
            <>
              {products.length === 0 ? (
                <p className="text-secondary fst-italic small">{m.admin_products_empty()}</p>
              ) : (
                <ListGroup variant="flush" className="mb-2">
                  {products.map((product) => renderRow(product))}
                </ListGroup>
              )}
            </>
          )}

          {formOpen && editingId === null && !preview ? (
            renderForm()
          ) : (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={openAdd}
              disabled={productsQuery.isPending || productsQuery.isError || formOpen}
            >
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              {m.admin_products_add()}
            </Button>
          )}
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>
            {m.close()}
          </Button>
        </Modal.Footer>
      </Modal>
      {confirmDialog}
    </>
  );
}
