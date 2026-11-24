import { formatEuro } from "@/lib/format/numberUtils";
import { getLocale } from "@/paraglide/runtime";
import { PencilIcon, TrashIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PresentationListItem } from "@/components/ui/presentation-list";
import { m } from "@/paraglide/messages";
import { categoryLabel } from "@/hooks/useCategories";
import type { Product } from "@/api-types";
import { RowActionButton, RowActions } from "@/components/admin/RowActions";
import { type ProductEditor } from "./useProductEditor";

interface ProductRowProps {
  product: Product;
  editor: ProductEditor;
}

/** One product in the list with its stock, inclusions and edit/delete actions. */
export function ProductRow({ product, editor }: ProductRowProps) {
  const { openEdit, handleDelete, editingId, formOpen, categories } = editor;
  const sold_out = product.purchasable && product.sold_out;
  const isBeingEdited = formOpen && editingId === product.id;
  return (
    <PresentationListItem className="flex flex-col gap-1 py-1 px-0 text-card-foreground">
      <div className="flex justify-between items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
          <span className="text-content">
            {product.name}
            <span className="block text-sm text-subtle">
              {m.admin_inventory_reserved()} {product.reserved_quantity ?? 0} /{" "}
              {product.stock ?? m.admin_inventory_unlimited()}
              {(product.shortage ?? 0) > 0
                ? ` — ${m.admin_inventory_shortage()}: ${product.shortage}`
                : ""}
            </span>
          </span>
          <Badge variant={product.purchasable ? "success" : "secondary"} className="text-micro">
            {product.purchasable ? m.admin_products_purchasable() : m.admin_products_hidden()}
          </Badge>
          {sold_out && (
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
          <span className="text-subtle text-sm">{formatEuro(product.price, getLocale())}</span>
        </span>
        <RowActions
          className="shrink-0"
          destructive={
            <RowActionButton
              destructive
              icon={TrashIcon}
              label={m.admin_delete_item({ name: product.name })}
              onClick={() => handleDelete(product)}
              disabled={formOpen}
            />
          }
        >
          <RowActionButton
            icon={PencilIcon}
            label={m.admin_edit_item({ name: product.name })}
            onClick={() => openEdit(product)}
            disabled={formOpen && !isBeingEdited}
          />
        </RowActions>
      </div>
    </PresentationListItem>
  );
}
