# Brand assets

Source files for the festival's identity. Nothing in this folder is published
with the site; the web versions live in `frontend/public/images/` and
`frontend/public/icons/`.

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

## Icons, sharing image and store graphics

`make_brand_assets.py` draws all of these from `fonts/` and the mascot master, so
nothing has to be exported by hand:

| Output | Where |
|---|---|
| Sharing image, 1200×630 JPEG under 300 KB (`og:image`, `twitter:image`, JSON-LD `Event.image`) | `frontend/public/images/og-image.jpg` |
| Favicons (`favicon.ico` with 16/32/48 px, plus the PNGs), `apple-touch-icon.png`, PWA icons (192, 512, maskable 512) | `frontend/public/icons/` |
| `logo.svg`, the broken-image fallback of `ResponsiveImage` and `LogoWall` | `frontend/public/images/logo.svg` |
| Android adaptive-icon foreground (vector) | `android/app/src/main/res/drawable/ic_launcher_foreground.xml` |
| Play Store icon (512 px) and feature graphic (1024×500) | `docs/play-store/` |

The icon mark is a "C" (Nunito Black) with a red script "f" (Dancing Script Bold)
tucked into its lower right, after the wordmark's "CHAMPAGNE" and "festival". The
sharing image shows the wordmark, the generic tagline and the mascot; it is
edition-independent on purpose (per-edition images are a separate issue, #1224). The
wordmark and tagline stay inside the central 630 px square, so square crops lose
only the mascot. The maskable icon keeps the mark inside the 80 % safe zone, and the
Android foreground inside the 66 dp circle.

The fonts are SIL OFL; their licences sit beside them in `fonts/`. They are only used
to draw these files, not shipped with the site (the live `BrandWordmark` uses system
fonts, so the raster wordmark is an approximation of it).

To regenerate (needs Pillow and fontTools), from the repository root:

```bash
uv run --with pillow --with fonttools python docs/brand/make_brand_assets.py
```

The Android adaptive-icon background in
`android/app/src/main/res/values/colors.xml` must equal the script's `PAPER` colour.
`frontend/tests/config/brandAssets.test.ts` checks that every file the HTML, web
manifest and JSON-LD point at is a real image of the declared size, so a placeholder
cannot ship again. After deploying, re-scrape the site in the Facebook Sharing
Debugger so the cached preview is replaced.
