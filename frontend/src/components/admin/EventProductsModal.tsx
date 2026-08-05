import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { deleteEventProduct, fetchEventProducts, saveEventProduct } from "@/utils/adminContentApi";
import { queryKeys } from "@/utils/queryKeys";
import type { Event, Product } from "@/types/event";
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
  price: string;
  category: OrderItemCategory;
  required: boolean;
  /** Empty string means "no bundle". */
  includedProductId: string;
  includedPerGuests: string;
}

const EMPTY_FORM: ProductFormState = {
  name: "",
  price: "",
  category: "champagne",
  required: false,
  includedProductId: "",
  includedPerGuests: "",
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

  const eventId = event?.id ?? "";
  const productsQueryKey = queryKeys.admin.eventProducts(eventId);

  const productsQuery = useQuery({
    queryKey: productsQueryKey,
    queryFn: () => fetchEventProducts(eventId, authHeaders),
    enabled: show && Boolean(eventId),
    staleTime: 0,
  });

  useEffect(() => {
    if (!show) {
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setError("");
    }
  }, [show]);

  const saveMutation = useMutation({
    mutationFn: (payload: {
      id?: string;
      name: string;
      price: number;
      category: OrderItemCategory;
      active: boolean;
      required: boolean;
      includedProductId?: string;
      includedPerGuests?: number;
    }) => saveEventProduct({ eventId, ...payload }, authHeaders),
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
  // A product can bundle any other active product on this event, except
  // itself and one that already bundles another (no chaining — see the
  // backend's _validate_inclusion_target).
  const bundleCandidates = activeProducts.filter(
    (p) => p.id !== editingId && !p.includedProductId,
  );

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setError("");
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      price: String(product.price),
      category: product.category,
      required: product.required,
      includedProductId: product.includedProductId ?? "",
      includedPerGuests: product.includedPerGuests != null ? String(product.includedPerGuests) : "",
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
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      setError(m.admin_products_price_invalid());
      return;
    }
    const includedPerGuests = form.includedProductId ? Number(form.includedPerGuests) : undefined;
    if (form.includedProductId && (!Number.isFinite(includedPerGuests) || (includedPerGuests ?? 0) < 1)) {
      setError(m.admin_products_bundle_ratio_invalid());
      return;
    }
    const existing = editingId ? activeProducts.find((p) => p.id === editingId) : undefined;
    try {
      const saved = await saveMutation.mutateAsync({
        id: editingId ?? undefined,
        name: form.name.trim(),
        price,
        category: form.category,
        active: existing?.active ?? true,
        required: form.required,
        includedProductId: form.includedProductId || undefined,
        includedPerGuests,
      });
      updateQueryData(saved);
      setFormOpen(false);
      setEditingId(null);
      onProductsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.admin_content_error_save());
    }
  }

  async function handleToggleActive(product: Product) {
    setError("");
    try {
      const saved = await saveMutation.mutateAsync({
        id: product.id,
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
            <span className={isArchived ? "text-secondary" : "text-light"}>{product.name}</span>
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

        {formOpen ? (
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

            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Group style={{ minWidth: "200px", flex: "2 1 200px" }} controlId="product-bundle-target">
                <Form.Label className="text-secondary small mb-1">
                  {m.admin_products_bundle_target()}
                </Form.Label>
                <Form.Select
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={form.includedProductId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, includedProductId: e.target.value }))
                  }
                >
                  <option value="">{m.admin_products_bundle_none()}</option>
                  {bundleCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              {form.includedProductId && (
                <Form.Group style={{ maxWidth: "160px" }} controlId="product-bundle-ratio">
                  <Form.Label className="text-secondary small mb-1">
                    {m.admin_products_bundle_ratio()}
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    step="1"
                    size="sm"
                    className="bg-dark text-light border-secondary"
                    value={form.includedPerGuests}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, includedPerGuests: e.target.value }))
                    }
                  />
                </Form.Group>
              )}
            </div>

            <div className="d-flex gap-2 justify-content-end">
              <Button variant="outline-secondary" size="sm" onClick={() => setFormOpen(false)}>
                {m.close()}
              </Button>
              <Button type="submit" variant="warning" size="sm" disabled={saveMutation.isPending}>
                <i className="bi bi-floppy me-1" aria-hidden="true" />
                {m.admin_save()}
              </Button>
            </div>
          </Form>
        ) : (
          <Button variant="outline-secondary" size="sm" onClick={openAdd}>
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
