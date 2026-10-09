"""Regenerate the mascot's transparent master and the web images served by the site.

Usage (needs only Pillow; run from the repository root):

    uv run --with pillow python docs/brand/mascot/make_web_versions.py cutout
    uv run --with pillow python docs/brand/mascot/make_web_versions.py web

`cutout` turns mascot-original.jpg (white background) into mascot-cutout-master.png.
`web` turns the master into the four WebP files in frontend/public/images/.
Edit the master by hand (or adjust the constants below) and re-run `web` for new crops.
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ORIGINAL = HERE / "mascot-original.jpg"
MASTER = HERE / "mascot-cutout-master.png"
WEB_DIR = HERE.parents[2] / "frontend" / "public" / "images"

# Near-white, low-saturation pixels connected to the border count as background.
WHITE_MIN = 232
WHITE_MAX_SATURATION = 18
# The painting has a light grey canvas square beside the shoulder; it needs a looser
# test, confined to this box (x0, y0, x1, y1) so the skin and dress are untouched.
GREY_PATCH_BOX = (226, 312, 280, 430)
GREY_PATCH_MIN = 200
GREY_PATCH_MAX_SATURATION = 16
# The white gap enclosed by the arm, dress and table does not touch the border.
ENCLOSED_GAP_BOX = (452, 671, 555, 805)

# Half-length crop: head to clutch, fading out below the table top.
HALF_CUT_Y = 1300
HALF_FADE_PX = 320
WEB_WIDTHS = (360, 720)
WEBP_QUALITY = 82


def _channel_range(image: Image.Image) -> tuple[Image.Image, Image.Image]:
    r, g, b = image.split()
    lowest = ImageChops.darker(ImageChops.darker(r, g), b)
    highest = ImageChops.lighter(ImageChops.lighter(r, g), b)
    return lowest, ImageChops.subtract(highest, lowest)


def _near_white(lowest: Image.Image, saturation: Image.Image, minimum: int, max_sat: int):
    return ImageChops.multiply(
        lowest.point(lambda v: 255 if v >= minimum else 0),
        saturation.point(lambda v: 255 if v <= max_sat else 0),
    )


def cutout() -> None:
    image = Image.open(ORIGINAL).convert("RGB")
    width, height = image.size
    lowest, saturation = _channel_range(image)

    mask = _near_white(lowest, saturation, WHITE_MIN, WHITE_MAX_SATURATION)
    patch = _near_white(lowest, saturation, GREY_PATCH_MIN, GREY_PATCH_MAX_SATURATION)
    mask.paste(
        ImageChops.lighter(mask.crop(GREY_PATCH_BOX), patch.crop(GREY_PATCH_BOX)),
        GREY_PATCH_BOX[:2],
    )

    pixels = mask.load()
    seeds = [(x, 0) for x in range(width)] + [(x, height - 1) for x in range(width)]
    seeds += [(0, y) for y in range(height)] + [(width - 1, y) for y in range(height)]
    x0, y0, x1, y1 = ENCLOSED_GAP_BOX
    seeds += [(x, y) for x in range(x0, x1) for y in range(y0, y1)]
    for seed in seeds:
        if pixels[seed] == 255:
            ImageDraw.floodfill(mask, seed, 128, thresh=0)

    # Shrink the opaque area by a pixel and soften it, so no white fringe remains.
    alpha = mask.point(lambda v: 0 if v == 128 else 255)
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))

    result = image.copy()
    result.putalpha(alpha)
    result.crop(alpha.getbbox()).save(MASTER)
    print(f"wrote {MASTER.relative_to(HERE.parents[2])}")


def _half_length(master: Image.Image) -> Image.Image:
    width = master.width
    crop = master.crop((0, 0, width, HALF_CUT_Y))
    fade = Image.new("L", crop.size, 255)
    draw = ImageDraw.Draw(fade)
    for row in range(HALF_FADE_PX):
        value = round(255 * (1 - (row + 1) / HALF_FADE_PX) ** 1.6)
        y = HALF_CUT_Y - HALF_FADE_PX + row
        draw.line([(0, y), (width, y)], fill=value)
    crop.putalpha(ImageChops.multiply(crop.getchannel("A"), fade))
    return crop.crop(crop.getchannel("A").getbbox())


def web() -> None:
    master = Image.open(MASTER).convert("RGBA")
    for name, image in (("mascot", master), ("mascot-half", _half_length(master))):
        for width in WEB_WIDTHS:
            height = round(image.height * width / image.width)
            target = WEB_DIR / f"{name}-{width}.webp"
            image.resize((width, height), Image.LANCZOS).save(target, "WEBP", quality=WEBP_QUALITY, method=6)
            print(f"wrote {target.relative_to(HERE.parents[2])} ({width}x{height})")


if __name__ == "__main__":
    steps = {"cutout": cutout, "web": web}
    if len(sys.argv) != 2 or sys.argv[1] not in steps:
        sys.exit(f"usage: {Path(sys.argv[0]).name} cutout|web")
    steps[sys.argv[1]]()
