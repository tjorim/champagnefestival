# Booking products, stock, packages and table allocation

**Status:** Agreed implementation completed through the combined booking editor on 2026-09-09; capsule-exchange companion policy remains open.
Related issue: [#802](https://github.com/tjorim/champagnefestival/issues/802).
These notes capture the present requirements, not permanent architectural rules.

## Booking and allocation

- Collectors book a quantity of whole tables; administrators assign physical
  tables later. Availability comes from product stock, independently of the
  floor plan. No separate per-booking maximum is required.
- One booking covers a whole purchased table and may purchase several tables.
  The companion/headcount rule remains unresolved pending organiser input;
  do not equate one table with one person or invent a relationship restriction.
- Festival seating can share a physical table between bookings and split one
  booking across several tables. Record the guest count on each allocation:
  six guests may be allocated four at one table and two at another. Capacity
  checks sum actual allocated guests at each table, not the booking's full
  guest count at every linked table. Whole-table purchases allocate exclusive
  tables within the event.
  Booking per table versus per person determines the relevant unit; no new
  event-wide allocation-mode setting was agreed. The exact schema is an
  implementation choice, not settled by this conversation.
- Plans belong to a room and a specific event. The same room can have different
  breakfast and evening arrangements on the same date. Reuse the existing
  independent copy-plan workflow across dates/events; no new copy feature is needed.
- Existing plans are test data. No automatic historical event-matching workflow
  is required; test plans can be recreated. This is not blanket permission to
  delete unrelated records or ignore active client contracts.
- Partial allocation is allowed: show “2 of 3 tables assigned”. All three units
  still reserve product stock. When booked quantity drops below allocated
  quantity, let the admin select tables to release and save the quantity,
  allocation, price-total and stock changes together.
- Merge `accessibility_note` into `notes`, preserving existing content. Use one
  optional notes/requests field, visible during allocation. Placement preferences
  (for example, sitting beside another booking) are requests, not guarantees.

## Product stock and prices

This broadens #802 into general event-product inventory as well as seating.
The first implementation increment adds optional stock alongside existing product prices.

- Every product may be unlimited or stock-limited. Bourse tables initially use
  one table product/price per event; quantity times unit price gives the charge.
- Bookings reserve stock immediately, including unpaid bookings. Cancellation
  releases reservations. No automatic unpaid-booking expiry was requested;
  administrators review, adjust or cancel excessive/unpaid requests.
- Visitors may request a booking change or cancellation from their booking.
  A request leaves the booking active until an administrator decides; the UI
  explains that acceptance and reimbursement are not guaranteed, including
  when a reserved table cannot be resold. Cancellation remains an administrator action.
- Quantity changes use the booked unit price. Preserve payment history and flag
  overpayment for manual refund when a reduction lowers the total.
- Show booked versus current unit price when they differ, and offer an individual
  contact-visitor action through the existing email-client workflow.
- Administrators may lower stock below reservations after a warning. Retain
  bookings, show the shortage, and block new sales requiring the depleted stock.
  Reductions and cancellations can still release reservations.

## Included products and nested packages

- Main products may include multiple products, including other packages.
  Reject circular inclusion. Included items have no additional charge even when
  they also have a standalone selling price.
- Count all included quantities toward preparation totals. Stock-limited included
  items share availability with separately ordered quantities; unlimited items
  are counted without limiting bookings. Show paid + included = total needed.
- The main product is booked per table or per person. Children multiply the
  quantity contributed by their parent; do not reapply the booking's attendee
  count at each nesting level.
- Example: two VIP tables × four included breakfasts × one coffee yields eight
  coffees. Three per-person breakfast tickets × one coffee yields three coffees.
- Where an inclusion uses a ratio, the administrator chooses rounding for that
  inclusion. Exact configuration/rounding presentation must be tested against
  these agreed examples; no further nested attendee multiplier was agreed.
- On changing package contents, ask whether existing bookings keep their contents
  or receive the update. Preview affected quantities and stock before confirmation.
- If the main product price also changes, ask separately whether existing bookings
  keep or receive the new price; preview totals and payment differences. Included
  products' standalone price changes do not add charges to the package.
- Updating existing packages may exceed stock after a warning: honour existing
  bookings, flag shortages, and block further sales requiring depleted products.

## Remaining question and implementation work

The organiser must confirm companion/headcount rules for capsule exchanges.
That choice is deliberately open; none of the stock or package decisions answers it.

Implementation is divided into:

1. Stable event-owned plans and physical allocation.
2. General stock reservation and booked-price handling.
3. Multiple/nested package inclusion and explicit updates to existing bookings.
4. Consolidating notes and presenting allocation requests.

Reconcile older #802 claims already addressed by #926/#927. Review Android,
REST and MCP consumers before changing contracts. Design transactions and locking
for stock races, allocation conflicts and bulk package updates; document and test
write retry guarantees in `docs/retry-safety.md`. These are implementation work,
not additional product choices being treated as agreed here. The first increment implements stock and nested packages, read-only previews with
stale-preview rejection, booked-price snapshots, recorded payment/refund amounts,
and consolidated notes. Existing partial-payment statuses do not establish an
amount; administrators must record the known amount before relying on refund
calculations. Existing paid bookings with a recorded total migrate that total to
amount paid. New API payment edits are audited; the complete payment/quantity
editor remains follow-up work.

The second increment adds event-owned plans, unique per room and event, with
edition/date derived from the event. An event can use several rooms, and copying
a plan copies geometry without bookings. The old day/edition layout fields and
single-table assignment write are removed. Migration 001 requires test plans to
be recreated instead of guessing their event ownership.

Bookings now have explicit allocations with guest counts and exclusive flags.
Shared bookings can split across tables; whole-table products use exclusive
allocations, including partial assignment without changing reserved stock.
Cancellation releases allocations. REST and MCP save the complete allocation
list atomically, including alongside quantity edits; the admin detail editor
supports allocation editing. Capacity uses allocated guests, with an explicit
admin override; exclusivity cannot be overridden. Package changes that would
invalidate existing allocations require releasing those allocations first.

The third increment adds one booking editor for guest count, status, purchased
quantities, recorded payment, notes and table allocations. It previews the new
total at the booking's preserved unit prices, along with the balance or manual
refund. When table quantity falls below the number assigned, saving remains
disabled until the administrator chooses which allocations to release. The API
then applies quantity, stock, payment and allocation changes in one transaction.
The floor-plan editor also supports the seating workflow directly: selecting a
table shows its assigned people and lets the administrator add a booking, change
the guest count on that allocation, move it to another table, or remove it.

All currently agreed implementation increments are complete. Capsule-exchange
companion rules remain undecided, so #802 remains open until that operating rule
is confirmed or explicitly split into a later issue.
These implementation notes describe current behaviour and can change with the
product; they are not additional constraints on future design.
