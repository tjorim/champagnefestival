import { formatEuro, formatNumber } from "@/lib/format/numberUtils";
import { getLocale } from "@/paraglide/runtime";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminCheck, AdminDescription } from "@/components/admin/AdminFields";
import { SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import { PresentationList } from "@/components/ui/presentation-list";
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
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Event } from "@/api-types";
import { AdminAddButton } from "@/components/admin/RowActions";
import { useProductEditor } from "./products/useProductEditor";
import { ProductEditorForm } from "./products/ProductEditorForm";
import { ProductRow } from "./products/ProductRow";

interface EventProductsModalProps {
  show: boolean;
  event: Event | null;

  onHide: () => void;
  onProductsChanged?: () => void;
}

export default function EventProductsModal({
  show,
  event,

  onHide,
  onProductsChanged,
}: EventProductsModalProps) {
  const editor = useProductEditor({ show, event, onProductsChanged });
  const {
    productsQuery,
    saveMutation,
    updateQueryData,
    products,
    openAdd,
    error,
    setError,
    editingId,
    setEditingId,
    formOpen,
    setFormOpen,
    preview,
    setPreview,
    confirmShortage,
    setConfirmShortage,
    previewPending,
    confirmDialog,
  } = editor;

  return (
    <>
      <Dialog
        open={show}
        onOpenChange={(open) => {
          if (!open) onHide();
        }}
      >
        <DialogContent admin size="lg" className="flex max-h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {preview
                ? m.admin_inventory_review()
                : formOpen
                  ? editingId
                    ? m.admin_editor_product_edit()
                    : m.admin_products_add()
                  : m.admin_products_title({ event: event?.title ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="min-h-0 overflow-y-auto">
            {preview && (
              <section
                className="rounded-md border border-border p-4 mb-4"
                aria-label={m.admin_inventory_review()}
              >
                <h3 className="text-base font-medium leading-tight">
                  {m.admin_inventory_existing_bookings()}
                </h3>
                <p>
                  {preview.payload.name.nl}: {formatEuro(preview.payload.price, getLocale())};{" "}
                  {m.admin_inventory_stock()}:{" "}
                  {preview.payload.stock ?? m.admin_inventory_unlimited()}
                </p>
                <div className="mb-4">
                  <AdminCheck
                    id="review-booked-contents"
                    disabled
                    checked={Boolean(preview.payload.updateExistingContents)}
                    label={m.admin_inventory_update_contents()}
                  />
                  <AdminCheck
                    id="review-booked-prices"
                    disabled
                    checked={Boolean(preview.payload.updateExistingPrices)}
                    label={m.admin_inventory_update_prices()}
                  />
                  <AdminDescription>{m.admin_inventory_keep_help()}</AdminDescription>
                </div>
                {preview.result.bookings.map((b) => (
                  <div key={b.id} className="mb-2">
                    <strong>{b.id}</strong>: {formatEuro(b.before_total, getLocale())} →{" "}
                    {formatEuro(b.after_total, getLocale())}; {m.admin_inventory_paid()}{" "}
                    {formatEuro(b.amount_paid, getLocale())}; {m.admin_inventory_refund()}{" "}
                    {formatEuro(b.refund_due, getLocale())}
                    <div>
                      {b.before_items
                        .map((i) => `${i.name}: ${formatNumber(i.quantity, getLocale())}`)
                        .join(", ")}{" "}
                      →{" "}
                      {b.after_items
                        .map((i) => `${i.name}: ${formatNumber(i.quantity, getLocale())}`)
                        .join(", ")}
                    </div>
                  </div>
                ))}
                {preview.result.shortages.map((s, i) => (
                  <Alert variant="warning" key={i}>
                    {s.name}: {m.admin_inventory_reserved()} {formatNumber(s.reserved, getLocale())}{" "}
                    / {formatNumber(s.stock, getLocale())}; {m.admin_inventory_shortage()}{" "}
                    {s.shortage}
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
              </section>
            )}

            {!formOpen && <p className="text-subtle text-sm mb-4">{m.admin_products_help()}</p>}

            {error && (
              <Alert id="product-editor-error" variant="danger" className="py-1 mb-2">
                {error}
              </Alert>
            )}

            {!formOpen &&
              (productsQuery.isPending ? (
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
                    <AdminEmptyState>{m.admin_products_empty()}</AdminEmptyState>
                  ) : (
                    <PresentationList flush className="mb-2">
                      {products.map((product) => (
                        <ProductRow key={product.id} product={product} editor={editor} />
                      ))}
                    </PresentationList>
                  )}
                </>
              ))}
            {formOpen && !preview ? (
              <ProductEditorForm editor={editor} />
            ) : (
              !formOpen && (
                <AdminAddButton
                  variant="outline"
                  onClick={openAdd}
                  disabled={productsQuery.isPending || productsQuery.isError || formOpen}
                >
                  {m.admin_products_add()}
                </AdminAddButton>
              )
            )}
          </DialogBody>
          {preview && (
            <DialogFooter className="shrink-0">
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
                    setError(apiErrorMessage(err, m.admin_content_error_save()));
                    setPreview(null);
                  }
                }}
              >
                {m.admin_save()}
              </Button>
              <Button
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => setPreview(null)}
              >
                {m.admin_editor_back_product()}
              </Button>
            </DialogFooter>
          )}
          {formOpen && !preview && (
            <DialogFooter className="shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={saveMutation.isPending || previewPending}
                onClick={() => setFormOpen(false)}
              >
                {m.admin_action_cancel()}
              </Button>
              <Button
                type="submit"
                form="event-product-editor"
                variant="warning"
                size="sm"
                disabled={saveMutation.isPending || previewPending}
              >
                <Icon icon={SaveIcon} />
                {m.admin_save()}
              </Button>
            </DialogFooter>
          )}
          {!formOpen && (
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={onHide}>
                {m.close()}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
