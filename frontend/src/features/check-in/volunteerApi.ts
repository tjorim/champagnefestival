import type { CheckInGuestOut, CheckInOut, VolunteerRegistrationUpdate } from "@/api-types";
import { m } from "@/paraglide/messages";
import { fetchArrayOrThrow, fetchJsonOrThrow } from "@/lib/api/adminApi";
import type { CheckInData } from "@/lib/api/publicRegistrationApi";

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
  );
}

export async function submitVolunteerCheckIn(
  registrationId: string,
  authHeaders: () => Record<string, string>,
): Promise<CheckInOut> {
  return fetchJsonOrThrow<CheckInOut>(
    `/api/volunteer/registrations/${encodeURIComponent(registrationId)}/check-in`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ issue_strap: false }),
    },
    m.checkin_error(),
  );
}

export async function updateVolunteerRegistration(
  registrationId: string,
  payload: { order_items?: CheckInData["order_items"]; strap_issued?: boolean },
  authHeaders: () => Record<string, string>,
): Promise<CheckInData> {
  const body: VolunteerRegistrationUpdate = {};
  if (payload.order_items) {
    body.order_items = payload.order_items.map((order) => ({
      product_id: order.product_id,
      delivered_quantity: order.delivered_quantity,
    }));
  }
  if (payload.strap_issued !== undefined) {
    body.strap_issued = payload.strap_issued;
  }

  const registration = await fetchJsonOrThrow<CheckInGuestOut>(
    `/api/volunteer/registrations/${encodeURIComponent(registrationId)}`,
    { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) },
    m.admin_error_update_registration(),
  );

  return registration;
}
