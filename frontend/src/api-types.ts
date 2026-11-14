// The API's shapes, as the backend declares them.
//
// `src/api-schema/` is generated from `openapi.json` (`pnpm api:generate`; `pnpm typecheck` fails when it is
// stale) and holds one type per schema, named as the backend names it: `OrganizationOut`, `ProductCreate`.
// Screens import every API shape from here, never from `api-schema/` directly, and declare no API record by
// hand. When a screen wants a friendlier name, alias the generated type below instead of copying its fields.
import type {
  AreaOut,
  LayoutOut,
  LayoutRevisionOut,
  PaymentTransactionLedgerRow,
  PaymentTransactionOut,
  RoomOut,
  TableOut,
  TableTypeOut,
  VenueOut,
} from "./api-schema";

export type * from "./api-schema";

// Floor plan and room management. The stored table row leaves out `registration_ids`: occupancy is derived
// from the registrations (see `state/tableOccupancy.ts`), never stored a second time.
export type Venue = VenueOut;
export type Room = RoomOut;
export type Layout = LayoutOut;
export type TableType = TableTypeOut;
export type FloorArea = AreaOut;
export type FloorTable = TableOut;
export type FloorTableRecord = Omit<TableOut, "registration_ids">;
export type LayoutRevision = LayoutRevisionOut;

// Payments. `amount` is an exact decimal string; format it with `Number(...)` where it is shown.
export type PaymentTransaction = PaymentTransactionOut;
export type LedgerTransaction = PaymentTransactionLedgerRow;
