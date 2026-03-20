export interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  roles: string[];
  firstHelpDay: string | null;
  lastHelpDay: string | null;
  nationalRegisterNumber: string | null;
  eidDocumentNumber: string | null;
  visitsPerMonth: number | null;
  clubName: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function apiToPerson(d: Record<string, unknown>): Person {
  return {
    id: d.id as string,
    name: d.name as string,
    email: (d.email ?? "") as string,
    phone: (d.phone ?? "") as string,
    address: (d.address ?? "") as string,
    roles: (d.roles as string[]) ?? [],
    firstHelpDay: (d.first_help_day as string | null) ?? null,
    lastHelpDay: (d.last_help_day as string | null) ?? null,
    nationalRegisterNumber: (d.national_register_number as string | null) ?? null,
    eidDocumentNumber: (d.eid_document_number as string | null) ?? null,
    visitsPerMonth: (d.visits_per_month as number | null) ?? null,
    clubName: (d.club_name ?? "") as string,
    notes: (d.notes ?? "") as string,
    active: (d.active ?? true) as boolean,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
  };
}
