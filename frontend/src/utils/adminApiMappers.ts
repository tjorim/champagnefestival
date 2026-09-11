import type {
  Room,
  FloorTable,
  FloorArea,
  TableType,
  Layout,
  Venue,
  AuditEntry,
  EditionAttendanceStats,
  EventCheckInStats,
  FaqItem,
  LayoutRevision,
  LayoutRevisionAreaChange,
  LayoutRevisionDiff,
  LayoutRevisionFieldChange,
  LayoutRevisionSnapshotArea,
  LayoutRevisionSnapshotTable,
  LayoutRevisionTableChange,
  LayoutRestoreAllocationConflict,
  LayoutRestorePreview,
} from "@/types/admin";
import type { Person } from "@/types/person";

/** Map FastAPI snake_case audit entry response to frontend camelCase AuditEntry type */
export function apiAuditEntryToAuditEntry(d: Record<string, unknown>): AuditEntry {
  return {
    id: d.id as string,
    timestamp: d.timestamp as string,
    actor: d.actor as string,
    action: d.action as string,
    resourceType: d.resource_type as string,
    resourceId: d.resource_id as string,
    requestId: (d.request_id ?? null) as string | null,
    details: (d.details ?? {}) as Record<string, unknown>,
  };
}

/** Map FastAPI snake_case per-event check-in stats response to frontend camelCase type */
export function apiEventCheckInStatsToEventCheckInStats(
  d: Record<string, unknown>,
): EventCheckInStats {
  return {
    eventId: d.event_id as string,
    total: d.total as number,
    checkedIn: d.checked_in as number,
  };
}

/** Map FastAPI snake_case edition attendance stats response to frontend camelCase type */
export function apiEditionStatsToEditionAttendanceStats(
  d: Record<string, unknown>,
): EditionAttendanceStats {
  return {
    editionId: d.edition_id as string,
    year: d.year as number,
    month: d.month as string,
    editionType: d.edition_type as string,
    startDate: (d.start_date ?? null) as string | null,
    eventsCount: d.events_count as number,
    totalRegistrations: d.total_registrations as number,
    totalGuests: d.total_guests as number,
    totalCheckedIn: d.total_checked_in as number,
    totalPaid: Number(d.total_paid ?? 0),
    totalDue: Number(d.total_due ?? 0),
    totalReceived: Number(d.total_received ?? 0),
    totalRefunded: Number(d.total_refunded ?? 0),
    totalOutstanding: Number(d.total_outstanding ?? 0),
    totalRefundLiability: Number(d.total_refund_liability ?? 0),
  };
}

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

/** Map FastAPI snake_case FAQ item response to frontend camelCase FaqItem type */
export function apiFaqItemToFaqItem(d: Record<string, unknown>): FaqItem {
  return {
    id: d.id as string,
    questionNl: d.question_nl as string,
    answerNl: d.answer_nl as string,
    questionEn: (d.question_en ?? null) as string | null,
    answerEn: (d.answer_en ?? null) as string | null,
    questionFr: (d.question_fr ?? null) as string | null,
    answerFr: (d.answer_fr ?? null) as string | null,
    sortOrder: (d.sort_order ?? 0) as number,
    active: (d.active ?? true) as boolean,
  };
}

/** Map FastAPI snake_case layout response to frontend camelCase Layout type */
export function apiLayoutToLayout(d: Record<string, unknown>): Layout {
  return {
    eventId: d.event_id as string,
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
    venueId: d.venue_id as string,
    shape: (d.shape ?? "rectangle") as "rectangle" | "round",
    widthM: (d.width_m ?? 1.8) as number,
    lengthM: (d.length_m ?? 0.7) as number,
    heightType: (d.height_type ?? "low") as "low" | "high",
    capacity: (d.capacity ?? 4) as number,
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
    dimensionsPlaceholder: (d.dimensions_placeholder ?? false) as boolean,
  };
}

/** Map FastAPI snake_case table response to frontend camelCase Table type */
export function apiTableToTable(d: Record<string, unknown>): FloorTable {
  return {
    eventId: d.event_id as string,
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

function apiLayoutRevisionSnapshotTable(d: Record<string, unknown>): LayoutRevisionSnapshotTable {
  return {
    id: d.id as string,
    name: d.name as string,
    x: d.x as number,
    y: d.y as number,
    rotation: d.rotation as number,
    tableTypeId: d.table_type_id as string,
    tableTypeName: d.table_type_name as string,
    capacity: d.capacity as number,
    widthM: d.width_m as number,
    lengthM: d.length_m as number,
  };
}

function apiLayoutRevisionSnapshotArea(d: Record<string, unknown>): LayoutRevisionSnapshotArea {
  return {
    id: d.id as string,
    label: d.label as string,
    icon: d.icon as string,
    x: d.x as number,
    y: d.y as number,
    rotation: d.rotation as number,
    widthM: d.width_m as number,
    lengthM: d.length_m as number,
  };
}

function apiLayoutRevisionFieldChange(d: Record<string, unknown>): LayoutRevisionFieldChange {
  return { field: d.field as string, before: d.before, after: d.after };
}

function apiLayoutRevisionTableChange(d: Record<string, unknown>): LayoutRevisionTableChange {
  return {
    id: d.id as string,
    before: apiLayoutRevisionSnapshotTable(d.before as Record<string, unknown>),
    after: apiLayoutRevisionSnapshotTable(d.after as Record<string, unknown>),
    changes: ((d.changes as Record<string, unknown>[]) ?? []).map(apiLayoutRevisionFieldChange),
  };
}

function apiLayoutRevisionAreaChange(d: Record<string, unknown>): LayoutRevisionAreaChange {
  return {
    id: d.id as string,
    before: apiLayoutRevisionSnapshotArea(d.before as Record<string, unknown>),
    after: apiLayoutRevisionSnapshotArea(d.after as Record<string, unknown>),
    changes: ((d.changes as Record<string, unknown>[]) ?? []).map(apiLayoutRevisionFieldChange),
  };
}

function apiLayoutRestoreAllocationConflict(
  d: Record<string, unknown>,
): LayoutRestoreAllocationConflict {
  return {
    kind: d.kind as "table" | "area",
    id: d.id as string,
    name: d.name as string,
    reason: d.reason as "deleted" | "moved",
    registrationIds: (d.registration_ids as string[]) ?? [],
    exhibitorId: (d.exhibitor_id as number | null) ?? null,
  };
}

/** Map FastAPI snake_case layout revision response to frontend camelCase LayoutRevision type */
export function apiLayoutRevisionToLayoutRevision(d: Record<string, unknown>): LayoutRevision {
  const snapshot = (d.snapshot ?? {}) as Record<string, unknown>;
  const room = (snapshot.room ?? {}) as Record<string, unknown>;
  return {
    id: d.id as string,
    layoutId: d.layout_id as string,
    revisionNumber: d.revision_number as number,
    label: (d.label ?? "") as string,
    changeNote: (d.change_note ?? null) as string | null,
    createdBy: d.created_by as string,
    createdAt: d.created_at as string,
    snapshot: {
      tables: ((snapshot.tables as Record<string, unknown>[]) ?? []).map(
        apiLayoutRevisionSnapshotTable,
      ),
      areas: ((snapshot.areas as Record<string, unknown>[]) ?? []).map(
        apiLayoutRevisionSnapshotArea,
      ),
      room: {
        widthM: (room.width_m ?? 0) as number,
        lengthM: (room.length_m ?? 0) as number,
      },
    },
  };
}

/** Map FastAPI snake_case revision-compare response to frontend camelCase LayoutRevisionDiff type */
export function apiLayoutRevisionDiffToLayoutRevisionDiff(
  d: Record<string, unknown>,
): LayoutRevisionDiff {
  return {
    layoutId: d.layout_id as string,
    fromRef: d.from_ref as string,
    toRef: d.to_ref as string,
    addedTables: ((d.added_tables as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotTable,
    ),
    removedTables: ((d.removed_tables as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotTable,
    ),
    changedTables: ((d.changed_tables as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionTableChange,
    ),
    addedAreas: ((d.added_areas as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotArea,
    ),
    removedAreas: ((d.removed_areas as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotArea,
    ),
    changedAreas: ((d.changed_areas as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionAreaChange,
    ),
  };
}

/** Map FastAPI snake_case restore-preview response to frontend camelCase LayoutRestorePreview type */
export function apiLayoutRestorePreviewToLayoutRestorePreview(
  d: Record<string, unknown>,
): LayoutRestorePreview {
  return {
    layoutId: d.layout_id as string,
    revisionNumber: d.revision_number as number,
    tablesToAdd: ((d.tables_to_add as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotTable,
    ),
    tablesToUpdate: ((d.tables_to_update as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionTableChange,
    ),
    tablesToRemove: ((d.tables_to_remove as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotTable,
    ),
    areasToAdd: ((d.areas_to_add as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotArea,
    ),
    areasToUpdate: ((d.areas_to_update as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionAreaChange,
    ),
    areasToRemove: ((d.areas_to_remove as Record<string, unknown>[]) ?? []).map(
      apiLayoutRevisionSnapshotArea,
    ),
    allocationConflicts: ((d.allocation_conflicts as Record<string, unknown>[]) ?? []).map(
      apiLayoutRestoreAllocationConflict,
    ),
    hasConflicts: (d.has_conflicts ?? false) as boolean,
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
