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
  reservationIds: string[];
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
