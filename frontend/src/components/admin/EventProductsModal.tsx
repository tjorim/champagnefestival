import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
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
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
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
      setForm(EMPTY_FORM);
      setError("");
    }
  }

  const saveMutation = useMutation({
    mutationFn: (payload: ProductWrite) => saveEventProduct(payload, authHeaders),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteEventProduct(productId, authHeaders),
    retry: false,
  });

  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [productsQuery.data],
  );
  const activeProducts = products.filter((p) => p.active);
  const archivedProducts = products.filter((p) => !p.active);
  // The server checks the complete graph for cycles.
  const bundleCandidates = activeProducts.filter((p) => p.id !== editingId);

  function openAdd() {
    setPreview(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setError("");
  }

  function openEdit(product: Product) {
    setPreview(null);
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      category: product.category,
      required: product.required,
      includedProductId: product.includedProductId ?? "",
      includedPerGuests: product.includedPerGuests != null ? String(product.includedPerGuests) : "",
      unit: product.unit ?? "item",
      stock: product.stock == null ? "" : String(product.stock),
      inclusions:
        product.inclusions ??
        (product.includedProductId
          ? [
              {
                product_id: product.includedProductId,
                quantity: 1,
                per_quantity: product.includedPerGuests ?? 1,
                rounding: "down",
                visible: true,
              },
            ]
          : []),
      updateExistingContents: false,
      updateExistingPrices: false,
    });
    setFormOpen(true);
    setError("");
  }

  function updateQueryData(saved: Product) {
    queryClient.setQueryData<Product[]>(productsQueryKey, (prev = []) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      return idx >= 0 ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError(m.admin_products_name_required());
      return;
    }
    const priceText = form.price.trim();
    const price = Number(priceText);
    if (!priceText || !Number.isFinite(price) || price < 0) {
      setError(m.admin_products_price_invalid());
      return;
    }
    const stock = form.stock.trim() === "" ? null : Number(form.stock);
    if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0)) {
      setError(m.admin_inventory_stock_invalid());
      return;
    }
    const existing = editingId ? activeProducts.find((p) => p.id === editingId) : undefined;
    try {
      const payload: ProductWrite = {
        eventId,
        id: editingId ?? undefined,
        name: form.name.trim(),
        description: form.description.trim(),
        price,
        category: form.category,
        active: existing?.active ?? true,
        required: form.required,
        unit: form.unit,
        stock,
        inclusions: form.inclusions,
        updateExistingContents: form.updateExistingContents,
        updateExistingPrices: form.updateExistingPrices,
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
  }

  async function handleToggleActive(product: Product) {
    setError("");
    try {
      const saved = await saveMutation.mutateAsync({
        id: product.id,
        eventId,
        name: product.name,
        price: product.price,
        category: product.category,
        active: !product.active,
        required: product.required,
        includedProductId: product.includedProductId,
        includedPerGuests: product.includedPerGuests,
      });
      updateQueryData(saved);
      onProductsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  async function handleDelete(productId: string) {
    setError("");
    try {
      await deleteMutation.mutateAsync(productId);
      queryClient.setQueryData<Product[]>(productsQueryKey, (prev = []) =>
        prev.filter((p) => p.id !== productId),
      );
      onProductsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  function renderRow(product: Product, isArchived: boolean) {
    const includedTarget = product.includedProductId
      ? products.find((p) => p.id === product.includedProductId)
      : undefined;
    return (
      <ListGroup.Item
        key={product.id}
        className={`bg-dark border-secondary d-flex flex-column gap-1 py-1 px-0 ${
          isArchived ? "opacity-50" : "text-light"
        }`}
      >
        <div className="d-flex justify-content-between align-items-center gap-2">
          <span className="d-flex align-items-center gap-2 text-truncate">
            <span className={isArchived ? "text-secondary" : "text-light"}>
              {product.name}
              <span className="d-block small text-secondary">
                {m.admin_inventory_reserved()} {product.reservedQuantity ?? 0} /{" "}
                {product.stock ?? m.admin_inventory_unlimited()}
                {(product.shortage ?? 0) > 0
                  ? ` — ${m.admin_inventory_shortage()}: ${product.shortage}`
                  : ""}
              </span>
            </span>
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
            {!isArchived && (
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => openEdit(product)}
                aria-label={`Edit ${product.name}`}
              >
                <i className="bi bi-pencil" aria-hidden="true" />
              </Button>
            )}
            {isArchived ? (
              <>
                <Button
                  size="sm"
                  variant="outline-success"
                  onClick={() => handleToggleActive(product)}
                  aria-label={`${m.admin_content_restore()} ${product.name}`}
                  title={m.admin_content_restore()}
                >
                  <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => handleDelete(product.id)}
                  aria-label={`${m.admin_delete()} ${product.name}`}
                >
                  <i className="bi bi-trash" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => handleToggleActive(product)}
                aria-label={`${m.admin_content_archive()} ${product.name}`}
                title={m.admin_content_archive()}
              >
                <i className="bi bi-archive" aria-hidden="true" />
              </Button>
            )}
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
      </ListGroup.Item>
    );
  }

  return (
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
              {m.admin_inventory_stock()}: {preview.payload.stock ?? m.admin_inventory_unlimited()}
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
                saveMutation.isPending || (preview.result.shortages.length > 0 && !confirmShortage)
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
            {activeProducts.length === 0 && archivedProducts.length === 0 ? (
              <p className="text-secondary fst-italic small">{m.admin_products_empty()}</p>
            ) : (
              <ListGroup variant="flush" className="mb-2">
                {activeProducts.map((product) => renderRow(product, false))}
              </ListGroup>
            )}

            {archivedProducts.length > 0 && (
              <div className="mb-2">
                <div className="text-secondary small mb-1">
                  {m.admin_content_archived_section()}
                </div>
                <ListGroup variant="flush">
                  {archivedProducts.map((product) => renderRow(product, true))}
                </ListGroup>
              </div>
            )}
          </>
        )}

        {formOpen && !preview ? (
          <Form
            onSubmit={handleSubmit}
            noValidate
            className="border-top border-secondary pt-3 mt-2"
          >
            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Group style={{ minWidth: "200px", flex: "2 1 200px" }} controlId="product-name">
                <Form.Label className="text-secondary small mb-1">
                  {m.admin_products_name()}
                </Form.Label>
                <Form.Control
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Form.Group>
              <Form.Group
                style={{ minWidth: "200px", flex: "2 1 200px" }}
                controlId="product-description"
              >
                <Form.Label className="text-secondary small mb-1">
                  {m.admin_products_description()}
                </Form.Label>
                <Form.Control
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  maxLength={300}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </Form.Group>
              <Form.Group style={{ maxWidth: "120px" }} controlId="product-price">
                <Form.Label className="text-secondary small mb-1">
                  {m.admin_products_price()}
                </Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  step="0.01"
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </Form.Group>
              <Form.Group style={{ maxWidth: "160px" }} controlId="product-category">
                <Form.Label className="text-secondary small mb-1">
                  {m.admin_products_category()}
                </Form.Label>
                <Form.Select
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as OrderItemCategory }))
                  }
                >
                  <option value="champagne">{m.admin_products_category_champagne()}</option>
                  <option value="food">{m.admin_products_category_food()}</option>
                  <option value="other">{m.admin_products_category_other()}</option>
                </Form.Select>
              </Form.Group>
            </div>

            <Form.Check
              type="checkbox"
              id="product-required"
              className="mb-2"
              label={m.admin_products_required_label()}
              checked={form.required}
              onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
            />
            <div className="text-secondary small mb-2">{m.admin_products_required_help()}</div>

            <Form.Group controlId="product-unit" className="mb-2">
              <Form.Label>{m.admin_inventory_unit()}</Form.Label>
              <Form.Select
                value={form.unit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unit: e.target.value as ProductFormState["unit"] }))
                }
              >
                <option value="item">{m.admin_inventory_unit_item()}</option>
                <option value="person">{m.admin_inventory_unit_person()}</option>
                <option value="table">{m.admin_inventory_unit_table()}</option>
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="product-stock" className="mb-2">
              <Form.Label>{m.admin_inventory_stock()}</Form.Label>
              <Form.Control
                type="number"
                min={0}
                step={1}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
              <Form.Text>{m.admin_inventory_unlimited_help()}</Form.Text>
            </Form.Group>
            <fieldset className="mb-3">
              <legend className="h6">{m.admin_inventory_inclusions()}</legend>
              {form.inclusions.map((edge, index) => (
                <div className="d-flex flex-wrap gap-2 mb-2" key={index}>
                  <Form.Select
                    aria-label={m.admin_products_bundle_target()}
                    value={edge.product_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        inclusions: f.inclusions.map((x, i) =>
                          i === index ? { ...x, product_id: e.target.value } : x,
                        ),
                      }))
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
                    aria-label={m.admin_inventory_included_quantity()}
                    value={edge.quantity}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        inclusions: f.inclusions.map((x, i) =>
                          i === index ? { ...x, quantity: Number(e.target.value) } : x,
                        ),
                      }))
                    }
                  />
                  <Form.Control
                    type="number"
                    min={1}
                    step={1}
                    aria-label={m.admin_inventory_per_quantity()}
                    value={edge.per_quantity}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        inclusions: f.inclusions.map((x, i) =>
                          i === index ? { ...x, per_quantity: Number(e.target.value) } : x,
                        ),
                      }))
                    }
                  />
                  <Form.Select
                    aria-label={m.admin_inventory_rounding()}
                    value={edge.rounding}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        inclusions: f.inclusions.map((x, i) =>
                          i === index ? { ...x, rounding: e.target.value as "up" | "down" } : x,
                        ),
                      }))
                    }
                  >
                    <option value="down">{m.admin_inventory_round_down()}</option>
                    <option value="up">{m.admin_inventory_round_up()}</option>
                  </Form.Select>
                  <Form.Check
                    type="checkbox"
                    id={`inclusion-visible-${index}`}
                    className="align-self-center"
                    label={m.admin_inventory_inclusion_visible()}
                    checked={edge.visible}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        inclusions: f.inclusions.map((x, i) =>
                          i === index ? { ...x, visible: e.target.checked } : x,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline-danger"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        inclusions: f.inclusions.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    {m.admin_inventory_remove()}
                  </Button>
                </div>
              ))}
              <Form.Text className="d-block mb-2">{m.admin_inventory_ratio_help()}</Form.Text>
              <Form.Text className="d-block mb-2">
                {m.admin_inventory_inclusion_visible_help()}
              </Form.Text>
              <Button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    inclusions: [
                      ...f.inclusions,
                      {
                        product_id: "",
                        quantity: 1,
                        per_quantity: 1,
                        rounding: "down",
                        visible: true,
                      },
                    ],
                  }))
                }
              >
                {m.admin_inventory_add_inclusion()}
              </Button>
            </fieldset>
            {editingId && (
              <fieldset className="mb-3">
                <legend className="h6">{m.admin_inventory_existing_bookings()}</legend>
                <Form.Check
                  id="update-booked-contents"
                  label={m.admin_inventory_update_contents()}
                  checked={form.updateExistingContents}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, updateExistingContents: e.target.checked }))
                  }
                />
                <Form.Check
                  id="update-booked-prices"
                  label={m.admin_inventory_update_prices()}
                  checked={form.updateExistingPrices}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, updateExistingPrices: e.target.checked }))
                  }
                />
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
        ) : (
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={openAdd}
            disabled={productsQuery.isPending || productsQuery.isError}
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
  );
}
