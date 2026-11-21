import type { Registration } from "@/types/registration";

export function isRegistrationInEdition(registration: Registration, editionId: string): boolean {
  return (
    registration.event?.edition_id === editionId || registration.event?.edition?.id === editionId
  );
}
