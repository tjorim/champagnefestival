import type { Room, FloorTable, FloorArea, TableType, Layout, Venue } from "@/types/admin";
import type { Person } from "@/types/person";

/** Map FastAPI snake_case venue response to frontend camelCase Venue type */
export function apiVenueToVenue(d: Record<string, unknown>): Venue {
  return {
    id: d.id as string,
    name: d.name as string,
    address: (d.address ?? "") as string,
    city: (d.city ?? "") as string,
    postalCode: (d.postal_code ?? "") as string,
    country: (d.country ?? "") as string,
    lat: (d.lat ?? 0) as number,
    lng: (d.lng ?? 0) as number,
    active: (d.active ?? true) as boolean,
  };
}

/** Map FastAPI snake_case layout response to frontend camelCase Layout type */
export function apiLayoutToLayout(d: Record<string, unknown>): Layout {
  return {
    id: d.id as string,
    editionId: (d.edition_id as string | null) ?? null,
    roomId: d.room_id as string,
    date: (d.date as string | null) ?? null,
    label: (d.label ?? "") as string,
    createdAt: d.created_at as string,
  };
}

/** Map FastAPI snake_case table type response to frontend camelCase TableType type */
export function apiTableTypeToTableType(d: Record<string, unknown>): TableType {
  return {
    id: d.id as string,
    name: d.name as string,
    shape: (d.shape ?? "rectangle") as "rectangle" | "round",
    widthM: (d.width_m ?? 1.8) as number,
    lengthM: (d.length_m ?? 0.7) as number,
    heightType: (d.height_type ?? "low") as "low" | "high",
    maxCapacity: (d.max_capacity ?? 4) as number,
    active: (d.active ?? true) as boolean,
  };
}

/** Map FastAPI snake_case room response to frontend camelCase Room type */
export function apiRoomToRoom(d: Record<string, unknown>): Room {
  return {
    id: d.id as string,
    venueId: d.venue_id as string,
    name: d.name as string,
    widthM: d.width_m as number,
    lengthM: d.length_m as number,
    color: d.color as string,
    active: (d.active ?? true) as boolean,
  };
}

/** Map FastAPI snake_case table response to frontend camelCase Table type */
export function apiTableToTable(d: Record<string, unknown>): FloorTable {
  return {
    id: d.id as string,
    name: d.name as string,
    capacity: d.capacity as number,
    x: d.x as number,
    y: d.y as number,
    tableTypeId: d.table_type_id as string,
    rotation: (d.rotation ?? 0) as number,
    layoutId: d.layout_id as string,
    registrationIds: (d.registration_ids as string[]) ?? [],
  };
}

/** Map FastAPI snake_case area response to frontend camelCase FloorArea type */
export function apiAreaToArea(d: Record<string, unknown>): FloorArea {
  return {
    id: d.id as string,
    layoutId: d.layout_id as string,
    icon: (d.icon ?? "bi-shop") as string,
    exhibitorId: (d.exhibitor_id as number | null) ?? null,
    label: (d.label ?? "") as string,
    x: (d.x ?? 50) as number,
    y: (d.y ?? 50) as number,
    rotation: (d.rotation ?? 0) as number,
    widthM: (d.width_m ?? 1.5) as number,
    lengthM: (d.length_m ?? 1.0) as number,
  };
}

export function mergeVolunteerPerson(existing: Person | undefined, volunteer: Person): Person {
  const roles = new Set(existing?.roles ?? volunteer.roles);
  roles.add("volunteer");
  return {
    ...(existing ?? volunteer),
    ...volunteer,
    email: existing?.email ?? volunteer.email,
    phone: existing?.phone ?? volunteer.phone,
    visitsPerMonth: existing?.visitsPerMonth ?? volunteer.visitsPerMonth,
    clubName: existing?.clubName ?? volunteer.clubName,
    notes: existing?.notes ?? volunteer.notes,
    roles: [...roles],
    helpPeriods: volunteer.helpPeriods,
  };
}

export function mergePeopleWithVolunteers(people: Person[], volunteers: Person[]): Person[] {
  const volunteerById = new Map(volunteers.map((volunteer) => [volunteer.id, volunteer]));
  const mergedPeople = people.map((person) => {
    const volunteer = volunteerById.get(person.id);
    return volunteer ? mergeVolunteerPerson(person, volunteer) : person;
  });

  const knownIds = new Set(mergedPeople.map((person) => person.id));
  const volunteerOnly = volunteers
    .filter((volunteer) => !knownIds.has(volunteer.id))
    .map((volunteer) => mergeVolunteerPerson(undefined, volunteer));

  return [...mergedPeople, ...volunteerOnly];
}

export function mergePersonUpdate(existing: Person | undefined, updated: Person): Person {
  if (!existing) {
    return updated;
  }

  if (!updated.roles.includes("volunteer")) {
    return updated;
  }

  return {
    ...updated,
    helpPeriods: existing.helpPeriods,
  };
}

export function replacePersonById(people: Person[], updated: Person): Person[] {
  return people.map((person) =>
    person.id === updated.id ? mergePersonUpdate(person, updated) : person,
  );
}

export function replaceVolunteerById(people: Person[], updatedVolunteer: Person): Person[] {
  return people.map((person) =>
    person.id === updatedVolunteer.id ? mergeVolunteerPerson(person, updatedVolunteer) : person,
  );
}

export function syncMembersWithPerson(members: Person[], person: Person): Person[] {
  if (!person.roles.includes("member")) {
    return members.filter((member) => member.id !== person.id);
  }

  const hasMember = members.some((member) => member.id === person.id);
  if (!hasMember) {
    return [person, ...members];
  }

  return members.map((member) => (member.id === person.id ? person : member));
}
