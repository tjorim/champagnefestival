import type { RegistrationListOut, RegistrationOut, RegistrationOutWithToken } from "@/api-types";
import { apiToEvent } from "./event";
import type { Registration } from "./registration";

/**
 * The API's registration, as it is, except for the nested event: that is still read into the
 * camelCase `Event` until the event slice of #1657 (events, products and editions embed each other, so
 * they move together). Nothing else is mapped, defaulted or clamped: the API validates quantities and
 * always sends every field (`OrderItemBase`, `ResponseModel`).
 */
export function apiToRegistration(
  registration: RegistrationListOut | RegistrationOut | RegistrationOutWithToken,
): Registration {
  return {
    ...registration,
    event: apiToEvent(registration.event as unknown as Record<string, unknown>),
  };
}
