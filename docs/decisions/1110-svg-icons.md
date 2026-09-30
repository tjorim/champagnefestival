# SVG icon migration (#1110)

The inventory below was generated from `bi-*` tokens in `frontend/src` and
`frontend/tests` before migration. Dynamic chevrons also use `ChevronRightIcon`.
Fixed icons import Lucide components directly; `Icon` provides decorative SVG
defaults, inherited colour and an `em` size. Icon-only controls retain their
existing accessible labels. All former fill variants use outlines with inherited
colour; no CSS fill is applied. Lucide has no brand icons, so the Facebook link
uses `ExternalLinkIcon` alongside its existing Facebook text.

Saved floor-plan icon identifiers remain unchanged on the API. `AreaIcon` maps
the supported legacy identifiers to Lucide and falls back to `StoreIcon` for
unknown identifiers. This changes rendering only, with no write or retry changes.
The package remains installed until #1111; the stylesheet and lint vendor source
are removed here. The service worker is network passthrough and has no precache.

| Previous identifier | Lucide component | Fill decision |
| --- | --- | --- |
| `bi-archive` | `ArchiveIcon` | Outline |
| `bi-arrow-clockwise` | `RotateCwIcon` | Outline |
| `bi-arrow-counterclockwise` | `RotateCcwIcon` | Outline |
| `bi-arrow-down-circle` | `CircleArrowDownIcon` | Outline |
| `bi-arrow-left` | `ArrowLeftIcon` | Outline |
| `bi-arrow-left-right` | `ArrowLeftRightIcon` | Outline |
| `bi-arrow-repeat` | `RefreshCwIcon` | Outline |
| `bi-award` | `AwardIcon` | Outline |
| `bi-bar-chart` | `ChartColumnIcon` | Outline |
| `bi-bar-chart-line` | `ChartColumnIcon` | Outline |
| `bi-basket` | `ShoppingBasketIcon` | Outline |
| `bi-basket-fill` | `ShoppingBasketIcon` | Outline, inherited colour |
| `bi-box-arrow-in-right` | `LogInIcon` | Outline |
| `bi-box-arrow-right` | `LogOutIcon` | Outline |
| `bi-building` | `BuildingIcon` | Outline |
| `bi-calendar-check` | `CalendarCheckIcon` | Outline |
| `bi-calendar-event` | `CalendarDaysIcon` | Outline |
| `bi-calendar-plus` | `CalendarPlusIcon` | Outline |
| `bi-calendar2-event` | `CalendarDaysIcon` | Outline |
| `bi-calendar3` | `CalendarIcon` | Outline |
| `bi-camera` | `CameraIcon` | Outline |
| `bi-camera-video-off` | `VideoOffIcon` | Outline |
| `bi-caret-down-fill` | `ChevronDownIcon` | Outline, inherited colour |
| `bi-caret-up-fill` | `ChevronUpIcon` | Outline, inherited colour |
| `bi-cart-fill` | `ShoppingCartIcon` | Outline, inherited colour |
| `bi-check-circle-fill` | `CircleCheckIcon` | Outline, inherited colour |
| `bi-check-lg` | `CheckIcon` | Outline |
| `bi-check2` | `CheckIcon` | Outline |
| `bi-check2-circle` | `CircleCheckIcon` | Outline |
| `bi-chevron-down` | `ChevronDownIcon` | Outline |
| `bi-chevron-up` | `ChevronUpIcon` | Outline |
| `bi-circle` | `CircleIcon` | Outline |
| `bi-clipboard-fill` | `ClipboardIcon` | Outline, inherited colour |
| `bi-clock-history` | `HistoryIcon` | Outline |
| `bi-collection` | `LayersIcon` | Outline |
| `bi-cup` | `CoffeeIcon` | Outline |
| `bi-cup-hot` | `CoffeeIcon` | Outline |
| `bi-cup-straw` | `CupSodaIcon` | Outline |
| `bi-dash` | `MinusIcon` | Outline |
| `bi-dash-lg` | `MinusIcon` | Outline |
| `bi-door-open` | `DoorOpenIcon` | Outline |
| `bi-download` | `DownloadIcon` | Outline |
| `bi-egg-fried` | `EggFriedIcon` | Outline |
| `bi-envelope` | `MailIcon` | Outline |
| `bi-envelope-paper` | `MailOpenIcon` | Outline |
| `bi-exclamation-circle` | `CircleAlertIcon` | Outline |
| `bi-exclamation-circle-fill` | `CircleAlertIcon` | Outline, inherited colour |
| `bi-exclamation-triangle` | `TriangleAlertIcon` | Outline |
| `bi-exclamation-triangle-fill` | `TriangleAlertIcon` | Outline, inherited colour |
| `bi-eye` | `EyeIcon` | Outline |
| `bi-eye-slash` | `EyeOffIcon` | Outline |
| `bi-facebook` | `ExternalLinkIcon` | Outline |
| `bi-file-earmark-spreadsheet` | `FileSpreadsheetIcon` | Outline |
| `bi-floppy` | `SaveIcon` | Outline |
| `bi-geo-alt` | `MapPinIcon` | Outline |
| `bi-gift` | `GiftIcon` | Outline |
| `bi-glass-champagne` | `WineIcon` | Outline |
| `bi-graph-up` | `ChartNoAxesCombinedIcon` | Outline |
| `bi-grid-3x3` | `Grid3X3Icon` | Outline |
| `bi-grid-3x3-gap` | `Grid3X3Icon` | Outline |
| `bi-hand-thumbs-up` | `ThumbsUpIcon` | Outline |
| `bi-hourglass-split` | `HourglassIcon` | Outline |
| `bi-image` | `ImageIcon` | Outline |
| `bi-inbox` | `InboxIcon` | Outline |
| `bi-info-circle` | `InfoIcon` | Outline |
| `bi-journal-text` | `NotebookTextIcon` | Outline |
| `bi-list` | `MenuIcon` | Outline |
| `bi-map` | `MapIcon` | Outline |
| `bi-megaphone` | `MegaphoneIcon` | Outline |
| `bi-music-note-beamed` | `MusicIcon` | Outline |
| `bi-pencil` | `PencilIcon` | Outline |
| `bi-people` | `UsersIcon` | Outline |
| `bi-people-fill` | `UsersIcon` | Outline, inherited colour |
| `bi-person` | `UserIcon` | Outline |
| `bi-person-badge` | `ContactRoundIcon` | Outline |
| `bi-person-badge-fill` | `ContactRoundIcon` | Outline, inherited colour |
| `bi-person-check-fill` | `UserCheckIcon` | Outline, inherited colour |
| `bi-person-circle` | `CircleUserRoundIcon` | Outline |
| `bi-person-fill` | `UserIcon` | Outline, inherited colour |
| `bi-person-fill-gear` | `UserRoundCogIcon` | Outline, inherited colour |
| `bi-person-plus` | `UserPlusIcon` | Outline |
| `bi-person-standing` | `AccessibilityIcon` | Outline |
| `bi-plus` | `PlusIcon` | Outline |
| `bi-plus-circle` | `CirclePlusIcon` | Outline |
| `bi-plus-lg` | `PlusIcon` | Outline |
| `bi-qr-code` | `QrCodeIcon` | Outline |
| `bi-qr-code-scan` | `ScanQrCodeIcon` | Outline |
| `bi-question-circle` | `CircleHelpIcon` | Outline |
| `bi-send` | `SendIcon` | Outline |
| `bi-shield-check` | `ShieldCheckIcon` | Outline |
| `bi-shield-lock` | `ShieldIcon` | Outline |
| `bi-shop` | `StoreIcon` | Outline |
| `bi-sliders` | `SlidersHorizontalIcon` | Outline |
| `bi-smartwatch` | `WatchIcon` | Outline |
| `bi-square` | `SquareIcon` | Outline |
| `bi-star` | `StarIcon` | Outline |
| `bi-stars` | `SparklesIcon` | Outline |
| `bi-table` | `TableIcon` | Outline |
| `bi-ticket-perforated-fill` | `TicketIcon` | Outline, inherited colour |
| `bi-tools` | `WrenchIcon` | Outline |
| `bi-trash` | `TrashIcon` | Outline |
| `bi-wifi-off` | `WifiOffIcon` | Outline |
| `bi-x` | `XIcon` | Outline |
| `bi-x-lg` | `XIcon` | Outline |
| `bi-x-octagon-fill` | `OctagonXIcon` | Outline, inherited colour |
| `bi-zoom-in` | `ZoomInIcon` | Outline |

## Acceptance and validation

- [x] No Bootstrap icon class renderers remain in source or tests; the stylesheet import is removed.
- [x] Decorative SVG defaults and labelled controls pass jest-axe checks; informational badges retain labelled wrappers.
- [x] Light and dark runtime themes render inherited SVG strokes.
- [x] Production output contains no Bootstrap icon fonts; the service worker has no precache to update.

`ConfirmModal` already used Lucide after #1107; its archive, warning and trash
choices are preserved. Dynamic sidebar toggles, copy feedback, visibility icons,
shape icons and expandable cards now select components rather than CSS names.
Validation:

- `pnpm exec vitest run --testTimeout=15000`: all 755 tests passed. The existing
  bulk-selection test exceeds the default five seconds on both this change and
  the unchanged branch; its targeted rerun also passes with this timeout.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build` passed.
- Five SVG icon theme checks and ten public/admin coexistence checks passed;
  the 22 existing runtime theme token checks also passed.
- Production output emits no `bootstrap-icons` fonts. Browser checks confirm
  visible inherited SVG strokes in light and dark scopes, with no `.bi` nodes.

Only icons are migrated in the otherwise legacy components: their remaining
controls, CSS and applicable lint exceptions belong to the component migration
issues. Each SVG carries the existing Tailwind migration marker. Informational
contact and placeholder badges use labelled wrappers; strap badges include
screen-reader text.
