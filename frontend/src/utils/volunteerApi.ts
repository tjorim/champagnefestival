import { m } from "@/paraglide/messages";
import { fetchArrayOrThrow, fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import type { CheckInData } from "@/utils/publicRegistrationApi";
import type { OrderItemCategory, RegistrationStatus } from "@/types/registration";

interface VolunteerRegistrationResponse {
  id?: string;
  name?: string;
  event_id?: string;
  event_title?: string;
  table_id?: string | null;
  table_name?: string | null;
  guest_count?: number;
  pre_orders?: Record<string, unknown>[];
  notes?: string;
  status?: RegistrationStatus;
  checked_in?: boolean;
  checked_in_at?: string | null;
  strap_issued?: boolean;
}

function isOrderItemCategory(value: unknown): value is OrderItemCategory {
  return value === "champagne" || value === "food" || value === "other";
}

function mapVolunteerRegistration(data: VolunteerRegistrationResponse): CheckInData {
  const rawOrders = Array.isArray(data.pre_orders) ? data.pre_orders : [];

  return {
    id: data.id ?? "",
    name: data.name ?? "",
    eventId: data.event_id ?? "",
    eventTitle: data.event_title ?? "",
    guestCount: data.guest_count ?? 1,
    preOrders: rawOrders.map((item) => {
      const quantityRaw = Number(item.quantity ?? 0);
      const quantity = Number.isFinite(quantityRaw) ? Math.max(0, quantityRaw) : 0;
      const deliveredQuantityRaw = Number(
        item.delivered_quantity ?? (item.delivered === true ? quantity : 0),
      );
      const deliveredQuantity = Number.isFinite(deliveredQuantityRaw)
        ? Math.max(0, Math.min(quantity, deliveredQuantityRaw))
        : 0;
      const remainingQuantity = quantity - deliveredQuantity;

      return {
        productId: String(item.product_id ?? ""),
        name: String(item.name ?? ""),
        quantity,
        deliveredQuantity,
        remainingQuantity,
        price: Number(item.price ?? 0),
        category: isOrderItemCategory(item.category) ? item.category : "other",
        delivered: remainingQuantity === 0,
      };
    }),
    notes: data.notes ?? "",
    accessibilityNote: "",
    status: data.status ?? "pending",
    checkedIn: data.checked_in ?? false,
    checkedInAt: data.checked_in_at ?? undefined,
    strapIssued: data.strap_issued ?? false,
  };
}


export async function searchVolunteerRegistrations(
  query: string,
  authHeaders: () => Record<string, string>,
  signal?: AbortSignal,
): Promise<CheckInData[]> {
  const params = new URLSearchParams({ q: query, limit: "10" });
  return fetchArrayOrThrow<CheckInData>(
    `/api/volunteer/registrations?${params.toString()}`,
    { method: "GET", headers: authHeaders(), signal },
    m.checkin_search_error(),
    (item) => mapVolunteerRegistration(item),
  );
}

export async function submitVolunteerCheckIn(
  registrationId: string,
  authHeaders: () => Record<string, string>,
): Promise<{ registration: CheckInData; alreadyCheckedIn: boolean }> {
  const registration = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
    `/api/volunteer/registrations/${encodeURIComponent(registrationId)}/check-in`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ issue_strap: true }),
    },
    m.checkin_error(),
  );

  return {
    registration: mapVolunteerRegistration(registration.registration as VolunteerRegistrationResponse),
    alreadyCheckedIn: Boolean(registration.already_checked_in),
  };
}
