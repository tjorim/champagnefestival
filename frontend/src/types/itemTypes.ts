import type { OrganizationOut, PersonSummaryOut } from "@/api-types";
export type ContactPerson = PersonSummaryOut;
/** Editor state: new items have no server timestamps or persisted contact yet. */
export type ItemDraft = Pick<OrganizationOut, "id" | "name" | "image"> & Partial<OrganizationOut>;
