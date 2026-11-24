import type { Product, ProductCreate, ProductUpdate } from "@/api-types";
import type { ProductChangePreviewOut as ProductChangePreview } from "@/api-types";
import type { Language, LocalizedText } from "@/components/admin/LocalizedFields";
import { m } from "@/paraglide/messages";
import { adminRequest } from "./adminApi";

/**
 * `<field>_nl/_fr/_en` request fields for a per-language text; a blank
 * translation is sent as `null`, which clears it on update.
 */
function localizedBody<Field extends string>(field: Field, text: LocalizedText) {
  const value = (language: Language) => text[language].trim() || null;
  return {
    [`${field}_nl`]: value("nl"),
    [`${field}_fr`]: value("fr"),
    [`${field}_en`]: value("en"),
  } as Record<`${Field}_${Language}`, string | null>;
}

export async function fetchEventProducts(eventId: string): Promise<Product[]> {
  const response = await adminRequest(
    `/api/products?event_id=${encodeURIComponent(eventId)}`,
    {},
    m.admin_content_error_load(),
  );
  const data = (await response.json()) as Product[];
  return Array.isArray(data) ? data : [];
}

/** UI command: generated product fields plus grouped translation controls and propagation choices. */
export type ProductWrite = Pick<
  ProductCreate,
  | "price"
  | "category"
  | "purchasable"
  | "required"
  | "included_product_id"
  | "included_per_guests"
  | "unit"
  | "stock"
  | "inclusions"
> & {
  id?: string;
  eventId: ProductCreate["event_id"];
  name: LocalizedText;
  description: LocalizedText;
  updateExistingContents?: ProductUpdate["update_existing_contents"];
  updateExistingPrices?: ProductUpdate["update_existing_prices"];
  confirmShortage?: ProductUpdate["confirm_shortage"];
  previewToken?: ProductUpdate["preview_token"];
};

export type { ProductChangePreview };
function productWriteBody(
  payload: ProductWrite,
): ProductUpdate & Partial<Pick<ProductCreate, "event_id">> {
  return {
    ...(!payload.id ? { event_id: payload.eventId } : {}),
    ...localizedBody("name", payload.name),
    ...localizedBody("description", payload.description),
    price: payload.price,
    category: payload.category,
    purchasable: payload.purchasable,
    required: payload.required,
    included_product_id: payload.included_product_id ?? null,
    included_per_guests: payload.included_per_guests ?? null,
    ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
    ...(payload.stock !== undefined ? { stock: payload.stock } : {}),
    ...(payload.inclusions !== undefined ? { inclusions: payload.inclusions } : {}),
    ...(payload.id
      ? {
          update_existing_contents: payload.updateExistingContents ?? false,
          update_existing_prices: payload.updateExistingPrices ?? false,
          confirm_shortage: payload.confirmShortage ?? false,
          preview_token: payload.previewToken,
        }
      : {}),
  };
}
export async function previewEventProduct(payload: ProductWrite): Promise<ProductChangePreview> {
  const response = await adminRequest(
    `/api/products/${payload.id}/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productWriteBody(payload)),
    },
    m.admin_content_error_save(),
  );
  return response.json();
}
export async function saveEventProduct(payload: ProductWrite): Promise<Product> {
  const response = await adminRequest(
    payload.id ? `/api/products/${payload.id}` : "/api/products",
    {
      method: payload.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productWriteBody(payload)),
    },
    m.admin_content_error_save(),
  );
  return (await response.json()) as Product;
}

export async function deleteEventProduct(productId: string): Promise<void> {
  await adminRequest(
    `/api/products/${productId}`,
    { method: "DELETE" },
    m.admin_content_error_save(),
  );
}
