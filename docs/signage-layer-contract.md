# Signage layer contract

Templates use the existing signage background and ordered `layers` JSON columns.
The first stored layer is at the back. The editor's layer list reverses that order,
showing the frontmost layer first. Drag handles and per-row forward/backward buttons
change this same stored order; visibility and locking are available on each row. The canvas is 1920×1080; `x` and `y` are the
**top-left** corner in canvas percentages, width and height are canvas percentages,
and rotation is clockwise in degrees about the layer centre. See also the
[floor-plan contract](floor-plan-coordinates.md). Slides supply content only;
template geometry cannot be overridden by slide content.

A background is a six-digit hex colour, a two-colour gradient at 135 degrees, or
a validated signage image upload. Layers are `binding`, `text`, `image`, `icon`
or `shape` (rectangle or ellipse). Bindings are `logo`, `name`, `description`,
`sponsor`, `title`, `text` and `icon`. The sponsor binding renders the translated
badge only for sponsors. Lucide's shared `signageIcons` registry supplies the
sticker picker; other artwork can be uploaded.

Layer IDs must be unique; documents have at most 100 layers. Colours are validated
six-digit hex values. Fonts are Arial (`sans`), Georgia (`serif`), or the platform
monospace font (`mono`). Text alignment is left, centre or right. Image fit is
contain or cover. Font size is in canvas pixels. Geometry and font sizes are
bounded by `backend/app/signage_schemas.py`. `visible` defaults to true, `locked`
to false, and `name` to an empty string. Locks affect editor changes only; hidden
layers do not render and do not satisfy required placeholders. Old documents
receive these defaults without a database migration.

Organisation slides require visible logo, name and sponsor bindings (the same
playlist expands producers and sponsors). Notices require title and text; image
slides require no bindings. Incomplete drafts can exist in storage, but the editor
flags them and disables saving for the selected preview kind. The service rejects
using an incomplete template for a slide, and rejects edits that remove bindings
required by any existing slide, including inactive slides.

The editor and player both use `SlideRenderer`. The editor scales that same fixed
canvas to its available width and overlays manipulation controls. Arrow keys move
a selected canvas layer by one percentage point (Shift: five); numeric properties
provide keyboard resize and rotation. Pointer handles support touch and mouse.
Each pointer gesture that changes content is one undo step; clicks and gestures
that return to their starting geometry preserve redo history. Cancelled gestures
restore their starting state. Undo history is local to the open template and is not persisted.

The template dialog places the layer list beside the canvas on desktop and below
it on narrow screens. Properties show content, appearance and position controls
for the selected layer: typography for text, image fit for images/logo bindings,
and colour for text, shapes and icons. Background controls are collapsible and
show only settings relevant to the selected background type.

The add menu offers each placeholder directly. **Add missing placeholders** restores
existing hidden, unlocked bindings before creating new slots, preserving existing
IDs and geometry. New required slots receive separate starter positions; hidden
locked slots remain untouched. The 100-layer document limit also applies to these
actions. Every completed reorder, visibility/lock change or automatic placeholder
addition is one local undo step. These edits remain drafts until **Save template**.
