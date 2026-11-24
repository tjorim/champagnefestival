export interface ItemRef {
  id: number;
  name: string;
  active: boolean;
}

/** The Add layout form. */
export interface NewLayoutState {
  eventId: string;
  copyFromLayoutId: string;
  copyTables: boolean;
  copyAreas: boolean;
}

/** The Add area form. */
export interface NewAreaState {
  label: string;
  icon: string;
  widthM: number;
  lengthM: number;
  assignedType: "" | "e";
  assignedId: number;
}

/** The Add table form. */
export interface NewTableState {
  name: string;
  tableTypeId: string;
}
