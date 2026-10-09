"""Regenerate the festival's icons, sharing image and store graphics from the brand sources.

Usage (needs Pillow and fontTools; run from the repository root):

    uv run --with pillow --with fonttools python docs/brand/make_brand_assets.py

Everything is drawn from `fonts/` (Nunito Black for "CHAMPAGNE" and the "C", Dancing
Script Bold for the script "festival" and the "f", both SIL OFL) and the transparent
mascot master in `mascot/`, so the output is reproducible and no asset has to be
exported by hand. The mark is a "C" with a red script "f" tucked into its lower right,
after the printed logo; the vector outputs (`logo.svg`, the Android launcher
foreground) are built from the same glyph outlines as the PNGs.

Writes:

- `frontend/public/icons/`: favicon.ico (16/32/48), favicon-{16,32,48}x{16,32,48}.png,
  apple-touch-icon.png, icon-{192,512}x{192,512}.png, icon-maskable-512x512.png
- `frontend/public/images/og-image.jpg` (1200x630) and `frontend/public/images/logo.svg`
- `android/app/src/main/res/drawable/ic_launcher_foreground.xml`
- `docs/play-store/app-icon-512.png` and `docs/play-store/feature-graphic-1024x500.png`

The Android adaptive-icon background colour (`ic_launcher_background` in
`android/app/src/main/res/values/colors.xml`) must stay equal to `PAPER` below.
"""

import random
from dataclasses import dataclass
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FONTS = HERE / "fonts"
MASCOT = HERE / "mascot" / "mascot-cutout-master.png"
ICONS_DIR = ROOT / "frontend" / "public" / "icons"
IMAGES_DIR = ROOT / "frontend" / "public" / "images"
ANDROID_FOREGROUND = ROOT / "android/app/src/main/res/drawable/ic_launcher_foreground.xml"
PLAY_DIR = ROOT / "docs" / "play-store"

PAPER = "#f6f1e7"  # Millésime paper; also the Android adaptive-icon background
INK = "#16130f"
RED = "#c8102e"  # the wordmark's "festival" red (`--wordmark-festival`)
SOFT_INK = "#5c5346"
BUBBLE = (201, 169, 97)  # muted gold, drawn translucent

TAGLINE = "Een viering van fijne champagne en gemeenschap"
STORE_TAGLINE = "QR check-in & guest lookup for staff and volunteers"

# The mark: a "C" with the script "f" overlapping its lower right. Sizes are relative to
# the "C" em; offsets are in C ems (y grows downwards, 0 is the C baseline).
F_SIZE = 1.45
F_DX = 0.40
F_DY = 0.17

SUPERSAMPLE = 4
OG_SIZE = (1200, 630)
OG_MAX_BYTES = 300 * 1024


def _font(name: str) -> TTFont:
    return TTFont(FONTS / name)


CHAMPAGNE_FONT = "Nunito-Black.ttf"
SCRIPT_FONT = "DancingScript-Bold.ttf"
TAGLINE_FONT = "Nunito-Bold.ttf"


@dataclass(frozen=True)
class Placed:
    """One glyph of the mark positioned on a canvas (origin = left end of the baseline)."""

    font: str
    char: str
    px: float  # em size in canvas pixels
    x: float
    y: float
    color: str


def _glyph_bounds(font: str, char: str) -> tuple[float, float, float, float]:
    ttf = _font(font)
    name = ttf.getBestCmap()[ord(char)]
    pen = BoundsPen(ttf.getGlyphSet())
    ttf.getGlyphSet()[name].draw(pen)
    scale = 1 / ttf["head"].unitsPerEm
    x0, y0, x1, y1 = pen.bounds
    # Flip to y-down em units.
    return x0 * scale, -y1 * scale, x1 * scale, -y0 * scale


def mark(cx: float, cy: float, size: float, ink: str = INK, accent: str = RED) -> list[Placed]:
    """Fit the C/f mark into a `size` square centred on (cx, cy)."""
    cb = _glyph_bounds(CHAMPAGNE_FONT, "C")
    fb = _glyph_bounds(SCRIPT_FONT, "f")
    parts = [
        (cb, 1.0, 0.0, 0.0),
        (tuple(v * F_SIZE for v in fb), F_SIZE, F_DX, F_DY),
    ]
    xs0 = min(b[0] + dx for b, _, dx, _ in parts)
    xs1 = max(b[2] + dx for b, _, dx, _ in parts)
    ys0 = min(b[1] + dy for b, _, _, dy in parts)
    ys1 = max(b[3] + dy for b, _, _, dy in parts)
    scale = size / max(xs1 - xs0, ys1 - ys0)
    left = cx - (xs1 - xs0) * scale / 2 - xs0 * scale
    top = cy - (ys1 - ys0) * scale / 2 - ys0 * scale
    return [
        Placed(CHAMPAGNE_FONT, "C", scale, left, top, ink),
        Placed(SCRIPT_FONT, "f", scale * F_SIZE, left + F_DX * scale, top + F_DY * scale, accent),
    ]


def _pil_font(name: str, px: float, factor: int = 1) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), max(1, round(px * factor)))


def draw_mark(canvas: Image.Image, placed: list[Placed], factor: int = 1) -> None:
    draw = ImageDraw.Draw(canvas)
    for p in placed:
        draw.text(
            (p.x * factor, p.y * factor),
            p.char,
            font=_pil_font(p.font, p.px, factor),
            fill=p.color,
            anchor="ls",
        )


def mark_svg_paths(placed: list[Placed]) -> list[tuple[str, str]]:
    """Glyph outlines as (colour, SVG path data) in canvas coordinates."""
    out = []
    for p in placed:
        ttf = _font(p.font)
        glyphs = ttf.getGlyphSet()
        name = ttf.getBestCmap()[ord(p.char)]
        k = p.px / ttf["head"].unitsPerEm
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{round(v, 2):g}")
        glyphs[name].draw(TransformPen(pen, (k, 0, 0, -k, p.x, p.y)))
        out.append((p.color, pen.getCommands()))
    return out


def _rounded_mask(size: int, radius: float, factor: int) -> Image.Image:
    mask = Image.new("L", (size * factor, size * factor), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * factor - 1, size * factor - 1), radius=radius * factor, fill=255
    )
    return mask


def icon(size: int, *, mark_fraction: float, rounded: bool) -> Image.Image:
    """Square icon: paper background with the mark. `rounded` leaves transparent corners."""
    factor = SUPERSAMPLE if size >= 64 else 8
    canvas = Image.new("RGBA", (size * factor, size * factor), PAPER)
    draw_mark(canvas, mark(size / 2, size / 2, size * mark_fraction), factor)
    canvas = canvas.resize((size, size), Image.LANCZOS)
    if rounded:
        canvas.putalpha(_rounded_mask(size, size * 0.2, factor).resize((size, size), Image.LANCZOS))
        return canvas
    return canvas.convert("RGB")


def write_png(image: Image.Image, path: Path) -> None:
    image.save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({image.width}x{image.height})")


def make_icons() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    # Browser tabs and install icons: small icons let the mark fill more of the square,
    # so the "C" and "f" survive at 16 px.
    for size, fraction in ((16, 0.9), (32, 0.86), (48, 0.82)):
        write_png(icon(size, mark_fraction=fraction, rounded=True), ICONS_DIR / f"favicon-{size}x{size}.png")
    ico_path = ICONS_DIR / "favicon.ico"
    frames = [icon(s, mark_fraction=f, rounded=True) for s, f in ((48, 0.82), (32, 0.86), (16, 0.9))]
    frames[0].save(ico_path, format="ICO", sizes=[(48, 48), (32, 32), (16, 16)], append_images=frames[1:])
    print(f"wrote {ico_path.relative_to(ROOT)} (16/32/48)")
    # iOS rounds the corners itself and rejects transparency, so it gets a full-bleed square.
    write_png(icon(180, mark_fraction=0.64, rounded=False), ICONS_DIR / "apple-touch-icon.png")
    for size in (192, 512):
        write_png(icon(size, mark_fraction=0.7, rounded=True), ICONS_DIR / f"icon-{size}x{size}.png")
    # Maskable: full bleed, and the mark stays inside the 80 % safe circle (its bounding
    # box is a square, so its corners sit at 0.707 * fraction of the half-size).
    write_png(icon(512, mark_fraction=0.5, rounded=False), ICONS_DIR / "icon-maskable-512x512.png")


def make_logo_svg() -> None:
    placed = mark(50, 50, 66)
    paths = "\n".join(f'  <path fill="{c}" d="{d}"/>' for c, d in mark_svg_paths(placed))
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 100 100">\n'
        "  <title>Champagnefestival</title>\n"
        f'  <rect width="100" height="100" rx="20" fill="{PAPER}"/>\n'
        f"{paths}\n</svg>\n"
    )
    path = IMAGES_DIR / "logo.svg"
    path.write_text(svg)
    print(f"wrote {path.relative_to(ROOT)}")


def make_android_foreground() -> None:
    # 108 dp canvas; Android masks to a circle of 66 dp, so keep the mark's box inside it.
    placed = mark(54, 54, 44)
    paths = []
    for color, data in mark_svg_paths(placed):
        paths.append(
            '    <path\n'
            f'        android:fillColor="{color.upper()}"\n'
            f'        android:pathData="{data}" />'
        )
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="108dp"\n'
        '    android:height="108dp"\n'
        '    android:viewportWidth="108"\n'
        '    android:viewportHeight="108">\n' + "\n".join(paths) + "\n</vector>\n"
    )
    ANDROID_FOREGROUND.write_text(xml)
    print(f"wrote {ANDROID_FOREGROUND.relative_to(ROOT)}")


# --- Wordmark, mascot and the wide graphics -------------------------------------------


def text_width(font: str, px: float, text: str) -> float:
    return _pil_font(font, px, 8).getlength(text) / 8


def fit_px(font: str, text: str, width: float) -> float:
    return width / text_width(font, 1, text)


def draw_wordmark(draw: ImageDraw.ImageDraw, x: float, y: float, width: float, factor: int) -> float:
    """Draw "CHAMPAGNE" over a red script "festival"; (x, y) is the top-left. Returns the bottom."""
    cap_px = fit_px(CHAMPAGNE_FONT, "CHAMPAGNE", width)
    cap_font = _pil_font(CHAMPAGNE_FONT, cap_px, factor)
    ascent, descent = cap_font.getmetrics()
    baseline = y + ascent / factor * 0.74  # cap height is about 0.7 em; this keeps the box tight
    draw.text((x * factor, baseline * factor), "CHAMPAGNE", font=cap_font, fill=INK, anchor="ls")
    script_px = cap_px * 0.82
    script_width = text_width(SCRIPT_FONT, script_px, "festival")
    sx = x + width - script_width - width * 0.04
    sy = baseline + script_px * 0.62
    draw.text(
        (sx * factor, sy * factor),
        "festival",
        font=_pil_font(SCRIPT_FONT, script_px, factor),
        fill=RED,
        anchor="ls",
    )
    return sy + script_px * 0.25


def paste_mascot(canvas: Image.Image, x: float, top: float, height: float, factor: int) -> None:
    master = Image.open(MASCOT).convert("RGBA")
    h = round(height * factor)
    w = round(master.width * h / master.height)
    canvas.alpha_composite(master.resize((w, h), Image.LANCZOS), (round(x * factor), round(top * factor)))


def bubbles(canvas: Image.Image, region: tuple[int, int, int, int], count: int, seed: int, factor: int) -> None:
    """Scatter translucent champagne bubbles over `region` (x0, y0, x1, y1)."""
    rng = random.Random(seed)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = region
    for _ in range(count):
        r = rng.choice((3, 4, 5, 7, 9, 12)) * factor
        cx = rng.uniform(x0, x1) * factor
        cy = rng.uniform(y0, y1) * factor
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=BUBBLE + (120,), width=max(1, factor))
        draw.ellipse(
            (cx - r * 0.55, cy - r * 0.6, cx - r * 0.2, cy - r * 0.25), fill=(255, 255, 255, 110)
        )
    canvas.alpha_composite(layer)


def make_og_image() -> None:
    factor = 2
    w, h = OG_SIZE
    canvas = Image.new("RGBA", (w * factor, h * factor), PAPER)
    bubbles(canvas, (30, 40, 300, h - 40), 16, seed=7, factor=factor)
    # Wordmark and tagline sit inside the central 630 px square, so square crops
    # (WhatsApp, some feeds) keep them; the mascot is the part those crops may lose.
    block_w = 560
    left = (w - block_w) / 2 - 50
    draw = ImageDraw.Draw(canvas)
    bottom = draw_wordmark(draw, left, 205, block_w, factor)
    tag_px = fit_px(TAGLINE_FONT, TAGLINE, block_w)
    tag_px = min(tag_px, 30)
    draw.text(
        ((left + block_w / 2) * factor, (bottom + 46) * factor),
        TAGLINE,
        font=_pil_font(TAGLINE_FONT, tag_px, factor),
        fill=SOFT_INK,
        anchor="mm",
    )
    draw.line(
        ((left + block_w / 2 - 50) * factor, (bottom + 12) * factor, (left + block_w / 2 + 50) * factor, (bottom + 12) * factor),
        fill=RED,
        width=2 * factor,
    )
    paste_mascot(canvas, 880, 38, 554, factor)
    image = canvas.resize((w, h), Image.LANCZOS).convert("RGB")
    path = IMAGES_DIR / "og-image.jpg"
    for quality in (90, 86, 82, 78, 74):
        image.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
        if path.stat().st_size <= OG_MAX_BYTES:
            break
    print(f"wrote {path.relative_to(ROOT)} ({w}x{h}, {path.stat().st_size // 1024} KB, quality {quality})")


def make_play_graphics() -> None:
    write_png(icon(512, mark_fraction=0.62, rounded=False), PLAY_DIR / "app-icon-512.png")

    factor = 2
    w, h = 1024, 500
    canvas = Image.new("RGBA", (w * factor, h * factor), PAPER)
    bubbles(canvas, (15, 25, 55, h - 25), 7, seed=11, factor=factor)
    draw = ImageDraw.Draw(canvas)
    block_w = 520
    left = 80
    bottom = draw_wordmark(draw, left, 140, block_w, factor)
    tag_px = min(fit_px(TAGLINE_FONT, STORE_TAGLINE, block_w), 26)
    draw.text(
        (left * factor, (bottom + 44) * factor),
        STORE_TAGLINE,
        font=_pil_font(TAGLINE_FONT, tag_px, factor),
        fill=SOFT_INK,
        anchor="lm",
    )
    paste_mascot(canvas, 770, 30, 440, factor)
    image = canvas.resize((w, h), Image.LANCZOS).convert("RGB")
    write_png(image, PLAY_DIR / "feature-graphic-1024x500.png")


if __name__ == "__main__":
    make_icons()
    make_logo_svg()
    make_android_foreground()
    make_og_image()
    make_play_graphics()
