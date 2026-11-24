import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EMPTY_LOCALIZED_TEXT,
  hasDutch,
  type LocalizedText,
} from "@/components/admin/LocalizedFields";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useProductCategories } from "@/hooks/useCategories";
import {
  deleteEventProduct,
  fetchEventProducts,
  saveEventProduct,
  previewEventProduct,
  type ProductWrite,
  type ProductChangePreview,
} from "@/lib/api/productsApi";
import { queryKeys } from "@/lib/query/queryKeys";
import type { Event, Product, ProductInclusionOut as ProductInclusion } from "@/api-types";

export interface ProductFormState {
  name: LocalizedText;
  description: LocalizedText;
  price: string;
  category: string;
  purchasable: boolean;
  required: boolean;
  unit: "item" | "table" | "person";
  stock: string;
  inclusions: ProductInclusion[];
  updateExistingContents: boolean;
  updateExistingPrices: boolean;
}

const EMPTY_FORM: ProductFormState = {
  name: EMPTY_LOCALIZED_TEXT,
  description: EMPTY_LOCALIZED_TEXT,
  price: "",
  category: "",
  purchasable: true,
  required: false,
  unit: "item",
  stock: "",
  inclusions: [],
  updateExistingContents: false,
  updateExistingPrices: false,
};

interface ProductEditorOptions {
  show: boolean;
  event: Event | null;
  onProductsChanged?: () => void;
}

/** The product list, its add/edit form and the save/preview/delete flow behind the products dialog. */
export function useProductEditor({ show, event, onProductsChanged }: ProductEditorOptions) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useProductCategories();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const [textLanguage, setTextLanguage] = useState("nl");
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [error, setError] = useState("");
  const [textError, setTextError] = useState<"name" | "description" | null>(null);
  useEffect(() => {
    if (error)
      document.getElementById("product-editor-error")?.scrollIntoView?.({ block: "nearest" });
  }, [error, validationAttempt]);
  // Runs after the Dutch tab is active, so the (kept-mounted) panel is no longer hidden.
  useEffect(() => {
    if (textError) document.getElementById(`product-${textError}-nl`)?.focus();
  }, [textError, validationAttempt]);
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
    queryFn: () => fetchEventProducts(eventId),
    enabled: show && Boolean(eventId),
    staleTime: 0,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ProductWrite) => saveEventProduct(payload),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteEventProduct(productId),
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
            name: {
              nl: editingProduct.name_nl ?? "",
              fr: editingProduct.name_fr ?? "",
              en: editingProduct.name_en ?? "",
            },
            description: {
              nl: editingProduct.description_nl ?? "",
              fr: editingProduct.description_fr ?? "",
              en: editingProduct.description_en ?? "",
            },
            price: String(editingProduct.price),
            category: editingProduct.category,
            purchasable: editingProduct.purchasable,
            required: editingProduct.required,
            unit: editingProduct.unit ?? "item",
            stock: editingProduct.stock == null ? "" : String(editingProduct.stock),
            inclusions: editingProduct.inclusions,
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
      setValidationAttempt((attempt) => attempt + 1);
      setTextError(null);
      if (!hasDutch(value.name)) {
        setTextLanguage("nl");
        setTextError("name");
        setError(m.admin_products_name_required());
        return;
      }
      if (
        (value.description.fr.trim() || value.description.en.trim()) &&
        !hasDutch(value.description)
      ) {
        setTextLanguage("nl");
        setTextError("description");
        setError(m.admin_products_description_required());
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
          name: value.name,
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
          const result = await previewEventProduct(payload);
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
        setError(apiErrorMessage(err, m.admin_content_error_save()));
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

  // Reset once when entering the editor. Form subscriptions may update other
  // components, so seed in a layout effect rather than during render.
  const seedForm = useEffectEvent(() => form.reset(formDefaultValues));
  useLayoutEffect(() => {
    if (formOpen) seedForm();
  }, [formOpen]);

  // Any product can be a bundle target, purchasable or hidden — the server
  // only checks the complete graph for cycles.
  const bundleCandidates = products.filter((p) => p.id !== editingId);

  function openAdd() {
    setTextLanguage("nl");
    setPreview(null);
    setEditingId(null);
    setFormOpen(true);
    setError("");
  }

  function openEdit(product: Product) {
    setTextLanguage("nl");
    setPreview(null);
    setEditingId(product.id);
    setFormOpen(true);
    setError("");
  }

  async function handleDelete(product: Product) {
    const confirmed = await confirm({
      title: m.admin_products_delete_title(),
      body: m.admin_products_delete_confirm({ name: product.name }),
      confirmLabel: m.admin_delete(),
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
      setError(apiErrorMessage(err, m.admin_content_error_save()));
    }
  }

  return {
    queryClient,
    eventId,
    productsQueryKey,
    productsQuery,
    saveMutation,
    deleteMutation,
    updateQueryData,
    products,
    editingProduct,
    formDefaultValues,
    form,
    inclusions,
    seedForm,
    bundleCandidates,
    openAdd,
    openEdit,
    handleDelete,
    textLanguage,
    setTextLanguage,
    validationAttempt,
    setValidationAttempt,
    error,
    setError,
    textError,
    setTextError,
    editingId,
    setEditingId,
    formOpen,
    setFormOpen,
    preview,
    setPreview,
    confirmShortage,
    setConfirmShortage,
    previewPending,
    setPreviewPending,
    wasShown,
    setWasShown,
    categories,
    confirm,
    confirmDialog,
  };
}

export type ProductEditor = ReturnType<typeof useProductEditor>;
