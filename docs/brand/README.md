# Brand assets

Source files for the festival's identity. Nothing in this folder is published
with the site; the web versions live in `frontend/public/images/`.

## Logo

`logo-reference.jpg` is the association's printed logo: "CHAMPAGNE" with a red
script "festival" (and the hostess illustration beside it). The site recreates it
as the `BrandWordmark` component rather than using this image. "festival" is
always red; "CHAMPAGNE" has appeared in black, white, green, yellow and blue, and
each runtime theme picks its colour through `--wordmark-champagne` (see
`docs/frontend-ui.md`).

## Mascot

| File | What it is |
|---|---|
| `mascot/mascot-original.jpg` | The painted hostess at her standing table, as supplied (white background). |
| `mascot/mascot-cutout-master.png` | Full-resolution transparent cut-out (873×2048). Start here for any new crop. |
| `mascot/make_web_versions.py` | Rebuilds the master from the original, and the web images from the master. |

The site uses four images generated from the master, shown by the
`FestivalMascot` component in the Next Festival section:

- `mascot-360.webp`, `mascot-720.webp`: the full figure, beside the countdown.
- `mascot-half-360.webp`, `mascot-half-720.webp`: head to clutch, fading out below
  the table, for narrow layouts where she stands above the countdown.

To regenerate them (only Pillow is needed), from the repository root:

```bash
uv run --with pillow python docs/brand/mascot/make_web_versions.py cutout  # original → master
uv run --with pillow python docs/brand/mascot/make_web_versions.py web     # master → web images
```

The cut-out removes near-white background connected to the image border, plus two
spots the border fill cannot reach: a light grey canvas square beside the shoulder
and the white gap enclosed by her arm and the table. Their coordinates are
constants at the top of the script. For a different crop, edit the master or the
crop constants and run `web` again.
