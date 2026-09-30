# Base UI dialogs and searchable selection

Issue: [#1107](https://github.com/tjorim/champagnefestival/issues/1107).

The shadcn `base-vega` Dialog, Alert Dialog and Combobox sources are owned in
`frontend/src/components/ui`. All former Bootstrap modal call sites use these
primitives directly; the transitional `AdminModal` adapter is removed. TanStack
Form, validation, mutations and save callbacks stay with their existing owners.
No write contract or retry policy changes.

## Portals and surfaces

Admin dialog and confirmation content explicitly opts into `AdminThemeScope`.
The admin callers of `useConfirmDialog` pass that scope through the hook too.
Public dialogs inherit the active document theme. Popup surfaces use semantic
popover tokens, rather than page-background tokens (Cuvée's dark page background
is unsuitable behind its dark foreground text). Dialog and popup layer tokens
keep portals above Bootstrap navigation during coexistence.

Dialog viewports scroll tall forms while Base UI locks document scrolling.
Dialog sizes use Tailwind scale values. The shell, close controls, confirmation
controls and searchable pickers use prefixed utilities; existing Bootstrap form
and detail contents continue through the gradual migration. Their admin form
rules target the explicit portal scope. Unused modal and react-select theme
selectors have been removed and the theme selector inventory regenerated.

## Interaction

Base UI owns focus trapping, initial focus, focus return, Escape handling and
outside dismissal. Controlled roots route dismissal through the previous hide
callback, preserving caller-owned form resets and guards. A caller can cancel a
close with Base UI's change-event details; no separate dialog implementation or
focus manager is introduced.

`ConfirmModal` exposes `alertdialog`, an accessible title and description. It
keeps pending and error state: all dismissal controls and Escape are blocked
while confirming, errors leave it open, success closes it, and closing clears
old errors. Alert Dialog normally forbids backdrop dismissal; this wrapper
explicitly preserves its existing dismiss-on-backdrop behaviour when idle.

Person pickers retain the existing debounced server search, selected values,
clear controls and loading feedback. Client filtering is disabled for these
server-filtered results. Edition exhibitors retain grouped active/archived
options, selected archived entries, local search, multiple selection and
removable chips. Option equality uses stable IDs across refreshed query results.
All picker inputs have translated accessible labels even while a portalled menu
hides surrounding labels from assistive technology. `react-select` is removed.

## Verification

Component coverage includes Escape/backdrop dismissal, focus return, rejection
of dirty-form dismissal, pending confirmations, error reset, keyboard selection,
clearing, grouped multiple selection and archived selections. Jest-axe covers
admin/public dialogs, confirmations and the searchable picker. Browser coverage
checks the public registration dialog's focus trap, scroll lock, dismissal and
focus return alongside submission, mobile bounds, runtime themes and legacy
stylesheet coexistence.

## Review follow-up: draft preservation

The related Worktime review exposed an existing reset-on-refresh path in CF's
EventModal. Event forms now reset only when opening or switching event/edition
IDs; rebuilding an event object or date array leaves the open draft intact.
Reopening still discards abandoned edits and starts from the current record.
Standalone event dates retain their existing synchronization with edition dates.

SettingsManagement had the same data-loss pattern outside the modal migration:
an unrelated maintenance-mode refresh reset unsaved contact fields. Settings
now refresh pristine forms while preserving dirty contact drafts. A successful
contact save establishes a pristine baseline only when no newer edits were
entered while it was pending. Mutation payloads and retry policies are unchanged.
Regression tests cover refreshed identities, reopen/record switches, pristine
settings refreshes, successful saves, and editing during an in-flight save.

## Review follow-up: warning confirmations

The [Worktime review](https://github.com/tjorim/worktime/pull/1399#discussion_r4149432719)
also applies to CF: mapping every non-danger confirmation to the default button
removed the warning distinction. `ConfirmModal` now maps warning confirmations
to an owned warning Button variant, using the semantic warning background and
warning-foreground tokens, including hover and keyboard-focus states. Primary
confirmations retain the default variant and danger retains destructive styling.
Existing over-capacity, policy-publication, venue-archive and table-dimension
callers retain their warning cue without changing callbacks or write contracts.
Regression coverage checks all three variants and pending warning confirmations.

The picker-clipping finding does not share CF's implementation: Combobox menus
are portalled outside the dialog's scrolling viewport, and DialogBody does not
introduce a clipping overflow rule.
