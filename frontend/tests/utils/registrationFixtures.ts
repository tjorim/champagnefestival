import type { Registration } from "@/types/registration";
import { apiToRegistration } from "@/types/registrationMapper";
import { eventOut, orderItemOut, registrationOut } from "@/mocks/data/builders";

export { eventOut, orderItemOut, registrationOut };

/** The same row as the admin screens hold it. */
export function registrationRow(overrides: Partial<Registration> = {}): Registration {
  return { ...apiToRegistration(registrationOut()), ...overrides };
}
