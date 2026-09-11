/**
 * Types for the admin floor plan and room management.
 */

export interface TableType {
  id: string;
  name: string;
  /** Venue this table type belongs to — table types are scoped like rooms, not shared (#858) */
  venueId: string;
  shape: "rectangle" | "round";
  /** Physical width in metres (rectangle) or diameter (round) */
  widthM: number;
  /** Physical length in metres; equals widthM for round tables */
  lengthM: number;
  heightType: "low" | "high";
  /** Physical maximum number of seats */
  capacity: number;
  active: boolean;
}

export interface FloorTable {
  eventId?: string;
  id: string;
  name: string;
  capacity: number;
  /** X position: percentage [0, 100] of the layout's rendered canvas width, top-left origin. See docs/floor-plan-coordinates.md. */
  x: number;
  /** Y position: percentage [0, 100] of the layout's rendered canvas height, top-left origin. See docs/floor-plan-coordinates.md. */
  y: number;
  /** Table type defining shape/dimensions */
  tableTypeId: string;
  /** Rotation angle in whole degrees [0, 359], clockwise around this table's own center */
  rotation: number;
  /** Layout this table belongs to */
  layoutId: string;
  registrationIds: string[];
}

export interface FloorArea {
  id: string;
  layoutId: string;
  icon: string;
  exhibitorId: number | null;
  label: string;
  /** Same x/y/rotation contract as FloorTable — see docs/floor-plan-coordinates.md. */
  x: number;
  y: number;
  rotation: number;
  widthM: number;
  lengthM: number;
}

export interface Layout {
  id: string;
  eventId: string;
  editionId: string | null;
  /** Room this layout applies to */
  roomId: string;
  /** Actual layout date within the edition when available from the API */
  date: string | null;
  label: string;
  createdAt: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  lat: number;
  lng: number;
  active: boolean;
}

export interface Room {
  id: string;
  venueId: string;
  name: string;
  /** Room width in metres — used to render a proportional canvas */
  widthM: number;
  /** Room length in metres */
  lengthM: number;
  /** CSS colour string for the room badge / canvas border */
  color: string;
  active: boolean;
  /** True when widthM/lengthM are an unconfirmed placeholder, not a measured value */
  dimensionsPlaceholder: boolean;
}

/**
 * A FAQ item's admin-facing shape: every locale's content. Dutch is
 * required; English/French are optional per item — a blank translation
 * hides that item on that locale's public FAQ.
 */
export interface FaqItem {
  id: string;
  questionNl: string;
  answerNl: string;
  questionEn: string | null;
  answerEn: string | null;
  questionFr: string | null;
  answerFr: string | null;
  sortOrder: number;
  active: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId: string | null;
  details: Record<string, unknown>;
}

/** One table's stable identity and geometry, captured at save-revision time
 * (or read live for the "current" side of a compare/restore preview). `id`
 * is the source FloorTable.id — the stable identity compare/restore match
 * on, never the mutable `name` (#1021). */
export interface LayoutRevisionSnapshotTable {
  id: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  tableTypeId: string;
  tableTypeName: string;
  capacity: number;
  widthM: number;
  lengthM: number;
}

/** One area's stable identity and geometry — same contract as
 * LayoutRevisionSnapshotTable. Deliberately excludes exhibitorId: exhibitor
 * assignments are live operational data, never part of a revision. */
export interface LayoutRevisionSnapshotArea {
  id: string;
  label: string;
  icon: string;
  x: number;
  y: number;
  rotation: number;
  widthM: number;
  lengthM: number;
}

export interface LayoutRevisionSnapshot {
  tables: LayoutRevisionSnapshotTable[];
  areas: LayoutRevisionSnapshotArea[];
  room: { widthM: number; lengthM: number };
}

/** An immutable, named geometry snapshot of one event-room plan (#1021). */
export interface LayoutRevision {
  id: string;
  layoutId: string;
  revisionNumber: number;
  label: string;
  changeNote: string | null;
  createdBy: string;
  createdAt: string;
  snapshot: LayoutRevisionSnapshot;
}

export interface LayoutRevisionFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface LayoutRevisionTableChange {
  id: string;
  before: LayoutRevisionSnapshotTable;
  after: LayoutRevisionSnapshotTable;
  changes: LayoutRevisionFieldChange[];
}

export interface LayoutRevisionAreaChange {
  id: string;
  before: LayoutRevisionSnapshotArea;
  after: LayoutRevisionSnapshotArea;
  changes: LayoutRevisionFieldChange[];
}

/** Result of comparing two snapshots of one layout — a revision or the live
 * "current" draft — matched by stable table/area id, never by name/label. */
export interface LayoutRevisionDiff {
  layoutId: string;
  fromRef: string;
  toRef: string;
  addedTables: LayoutRevisionSnapshotTable[];
  removedTables: LayoutRevisionSnapshotTable[];
  changedTables: LayoutRevisionTableChange[];
  addedAreas: LayoutRevisionSnapshotArea[];
  removedAreas: LayoutRevisionSnapshotArea[];
  changedAreas: LayoutRevisionAreaChange[];
}

/** One live allocation a restore would silently orphan by deleting or moving
 * its table, or deleting an exhibitor-assigned area. Restoring never touches
 * the registration/exhibitor assignment itself — this only flags the
 * conflict so the caller can make a deliberate resolveAllocations call. */
export interface LayoutRestoreAllocationConflict {
  kind: "table" | "area";
  id: string;
  name: string;
  reason: "deleted" | "moved";
  registrationIds: string[];
  exhibitorId: number | null;
}

export interface LayoutRestorePreview {
  layoutId: string;
  revisionNumber: number;
  tablesToAdd: LayoutRevisionSnapshotTable[];
  tablesToUpdate: LayoutRevisionTableChange[];
  tablesToRemove: LayoutRevisionSnapshotTable[];
  areasToAdd: LayoutRevisionSnapshotArea[];
  areasToUpdate: LayoutRevisionAreaChange[];
  areasToRemove: LayoutRevisionSnapshotArea[];
  allocationConflicts: LayoutRestoreAllocationConflict[];
  hasConflicts: boolean;
}

/**
 * Per-event check-in progress, as counted by the backend.
 *
 * Guest counts, not booking counts — a booking can carry several guests, and a
 * headcount is what a capacity limit and an entrance display both care about.
 * Cancelled bookings are excluded on both sides.
 */
export interface EventCheckInStats {
  eventId: string;
  total: number;
  checkedIn: number;
}

export interface EditionAttendanceStats {
  editionId: string;
  year: number;
  month: string;
  editionType: string;
  startDate: string | null;
  eventsCount: number;
  totalRegistrations: number;
  totalGuests: number;
  totalCheckedIn: number;
  totalPaid: number;
  totalDue: number;
  /** Sum of `payment`-kind ledger entries (#1019) — gross received, before refunds. */
  totalReceived: number;
  /** Sum of `refund`-kind ledger entries, as a positive amount. */
  totalRefunded: number;
  /** Sum, per booking, of max(amountDue - net paid, 0) — money still owed. */
  totalOutstanding: number;
  /** Sum, per booking, of max(net paid - amountDue, 0) — a refund may be owed. */
  totalRefundLiability: number;
}
