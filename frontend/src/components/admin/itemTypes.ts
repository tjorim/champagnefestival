export interface ContactPerson {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface ItemDraft {
  id: number;
  name: string;
  image: string;
  website?: string;
  active?: boolean; // undefined treated as true (backward-compat with existing persisted data)
  type?: string;
  contactPersonId?: string | null;
  contactPerson?: ContactPerson | null;
}
