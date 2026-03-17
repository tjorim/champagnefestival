/**
 * Types for the admin floor plan and room management.
 */

export interface FloorTable {
  id: string;
  name: string;
  capacity: number;
  /** X position (percentage of room width) */
  x: number;
  /** Y position (percentage of room height) */
  y: number;
  /** Room this table belongs to (null = unassigned / legacy) */
  roomId: string | null;
  /** Visual shape on the floor plan canvas */
  shape: "rectangle" | "round";
  /** Physical width in metres (rectangle) or diameter (round) */
  widthM: number;
  /** Physical length in metres (second tabletop dimension); equals widthM for round tables */
  lengthM: number;
  /** Rotation angle in whole degrees [0, 359], clockwise */
  rotation: number;
  /** Whether this is a low or high-top table */
  heightType: "low" | "high";
  /** Layout snapshot this table belongs to (null = global / unversioned) */
  layoutId: string | null;
  reservationIds: string[];
}

export interface Layout {
  id: string;
  editionId: string | null;
  /** Room this layout applies to */
  roomId: string | null;
  /** 1 = Friday, 2 = Saturday, 3 = Sunday */
  dayId: number;
  label: string;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  /** Room width in metres — used to render a proportional canvas */
  widthM: number;
  /** Room length in metres */
  lengthM: number;
  /** CSS colour string for the room badge / canvas border */
  color: string;
}
