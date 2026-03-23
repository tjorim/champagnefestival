export interface EventEditionSummary {
  id: string;
  year: number;
  month: string;
  editionType: "festival" | "bourse" | "capsule_exchange";
  active: boolean;
}

export interface Event {
  id: string;
  editionId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime?: string;
  category: string;
  location?: string;
  presenter?: string;
  registrationRequired: boolean;
  registrationsOpenFrom?: string;
  maxCapacity?: number;
  sortOrder?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  edition?: EventEditionSummary | null;
}

export interface EventFormData {
  editionId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  category: string;
  location: string;
  presenter: string;
  registrationRequired: boolean;
  registrationsOpenFrom: string;
  maxCapacity: string;
  sortOrder: string;
  active: boolean;
}

export function apiToEvent(data: Record<string, unknown>): Event {
  const rawEdition =
    typeof data.edition === "object" && data.edition !== null
      ? (data.edition as Record<string, unknown>)
      : null;

  return {
    id: String(data.id ?? ""),
    editionId: String(data.edition_id ?? ""),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    date: String(data.date ?? ""),
    startTime: String(data.start_time ?? ""),
    endTime: typeof data.end_time === "string" ? data.end_time : undefined,
    category: String(data.category ?? ""),
    location: typeof data.location === "string" ? data.location : undefined,
    presenter: typeof data.presenter === "string" ? data.presenter : undefined,
    registrationRequired: Boolean(data.registration_required),
    registrationsOpenFrom:
      typeof data.registrations_open_from === "string" ? data.registrations_open_from : undefined,
    maxCapacity: typeof data.max_capacity === "number" ? data.max_capacity : undefined,
    sortOrder: typeof data.sort_order === "number" ? data.sort_order : undefined,
    active: Boolean(data.active),
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
    edition: rawEdition
      ? {
          id: String(rawEdition.id ?? ""),
          year: Number(rawEdition.year ?? 0),
          month: String(rawEdition.month ?? ""),
          editionType:
            rawEdition.edition_type === "bourse" || rawEdition.edition_type === "capsule_exchange"
              ? rawEdition.edition_type
              : "festival",
          active: Boolean(rawEdition.active),
        }
      : null,
  };
}
