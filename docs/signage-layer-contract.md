# Signage layer contract

Templates use the existing signage background and ordered `layers` JSON columns.
The first layer is at the back. The canvas is 1920×1080; `x` and `y` are the
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
Each pointer gesture is one undo step; cancelled gestures restore their starting
state. Undo history is local to the open template and is not persisted.
