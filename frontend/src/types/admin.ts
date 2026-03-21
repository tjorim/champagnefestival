/**
 * Types for the admin floor plan and room management.
 */

export interface TableType {
  id: string;
  name: string;
  shape: "rectangle" | "round";
  /** Physical width in metres (rectangle) or diameter (round) */
  widthM: number;
  /** Physical length in metres; equals widthM for round tables */
  lengthM: number;
  heightType: "low" | "high";
  /** Physical maximum number of seats */
  maxCapacity: number;
  active: boolean;
}

export interface FloorTable {
  id: string;
  name: string;
  capacity: number;
  /** X position (percentage of room width) */
  x: number;
  /** Y position (percentage of room height) */
  y: number;
  /** Table type defining shape/dimensions */
  tableTypeId: string;
  /** Rotation angle in whole degrees [0, 359], clockwise */
  rotation: number;
  /** Layout this table belongs to */
  layoutId: string;
  reservationIds: string[];
}

export interface FloorArea {
  id: string;
  layoutId: string;
  icon: string;
  exhibitorId: number | null;
  label: string;
  x: number;
  y: number;
  rotation: number;
  widthM: number;
  lengthM: number;
}

export interface Layout {
  id: string;
  editionId: string | null;
  /** Room this layout applies to */
  roomId: string;
  /** 1-based day index within the edition */
  dayId: number;
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
}
