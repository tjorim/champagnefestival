import type { Registration } from "@/types/registration";

export function isRegistrationInEdition(
  registration: Registration,
  editionId: string,
): boolean {
  return (
    registration.event?.editionId === editionId ||
    registration.event?.edition?.id === editionId
  );
}
