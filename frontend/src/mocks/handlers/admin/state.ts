import type { AreaOut, LayoutOut, RoomOut, TableOut, TableTypeOut, VenueOut } from "@/api-types";
import type { StampCard, StampCardType } from "@/lib/editions/stampCards";
import { seedEventCategories, seedProductCategories } from "../../data/categories";
import { seedOrganizations } from "../../data/organizations";
import { seedPeople, type MockPerson } from "../../data/people";
import {
  seedAreas,
  seedLayouts,
  seedRooms,
  seedTableTypes,
  seedTables,
  seedVenues,
} from "../../data/venue";

/** Mutable in-memory stores — reset on page reload. */
export let people: MockPerson[] = structuredClone(seedPeople);
export let organizations: import("@/api-types").OrganizationOut[] =
  structuredClone(seedOrganizations);
export const eventCategories = { items: structuredClone(seedEventCategories) };
export const productCategories = { items: structuredClone(seedProductCategories) };
export let venues: VenueOut[] = structuredClone(seedVenues);
export let rooms: RoomOut[] = structuredClone(seedRooms);
export let tableTypes: TableTypeOut[] = structuredClone(seedTableTypes);
export let tables: TableOut[] = structuredClone(seedTables);
export let layouts: LayoutOut[] = structuredClone(seedLayouts);
export let areas: AreaOut[] = structuredClone(seedAreas);
export let stampTypes: StampCardType[] = [];
export let stampCards: StampCard[] = [];

// ES module bindings are read-only for importers, so the stores that handlers replace
// (rather than mutate in place) are reassigned through these setters.
export function setPeople(next: MockPerson[]): void {
  people = next;
}
export function setTables(next: TableOut[]): void {
  tables = next;
}
export function setAreas(next: AreaOut[]): void {
  areas = next;
}
export function setStampTypes(next: StampCardType[]): void {
  stampTypes = next;
}
export function setStampCards(next: StampCard[]): void {
  stampCards = next;
}

export function uid(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function now(): string {
  return new Date().toISOString();
}

/** Reset the stores owned by this module to their seeds. */
export function resetStateStores(): void {
  eventCategories.items = structuredClone(seedEventCategories);
  productCategories.items = structuredClone(seedProductCategories);
  stampTypes = [];
  stampCards = [];
  people = structuredClone(seedPeople);
  organizations = structuredClone(seedOrganizations);
  venues = structuredClone(seedVenues);
  rooms = structuredClone(seedRooms);
  tableTypes = structuredClone(seedTableTypes);
  tables = structuredClone(seedTables);
  layouts = structuredClone(seedLayouts);
  areas = structuredClone(seedAreas);
}
