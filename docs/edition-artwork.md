# Edition artwork uploads (#1224)

Admins upload each edition's artwork from the edition card in the admin
dashboard (expand the edition, **Artwork**), so a new edition needs no code
change or deployment. Uploads are admin-only and live immediately: there is no
manager review, so only a public storage root exists.

| Slot | Used for | Accepted | Stored as |
| --- | --- | --- | --- |
| `flyer` | The flyer on the maintenance page (falls back to `/images/flyer.jpg`) | Portrait (width ≤ height, ratio ≥ 0.4), at least 400 × 560 px | JPEG, longest side fitted into 2000 × 2800, never cropped |
| `hero` | The wide photo behind the Refresh theme's hero and the maintenance page (falls back to `/images/champagne-hero.png`) | Ratio 1.5–2.4, at least 1200 × 500 px | JPEG, fitted into 2400 × 1600 |
| `share` | `og:image`, `twitter:image` and the JSON-LD `Event.image` of the home page (falls back to the hero, then `/images/og-image.jpg`) | Ratio 1.91:1 ± 3 %, at least 1200 × 630 px | JPEG, trimmed and resized to exactly 1200 × 630 |

The hero is **per edition** (the public site only renders the active festival's
hero). It is also a theme choice: themes other than Refresh keep their own
backgrounds and ignore the upload, and the maintenance page uses it as its backdrop.

## Validation and storage

The multipart `file` must declare PNG, JPEG or WebP and actually decode as that
format; SVG, corrupt images, MIME mismatches and animations are rejected. Input
is limited to 10 MiB and 40,000,000 pixels. EXIF orientation is applied, alpha
is flattened onto white, and a fresh JPEG (quality 85, no EXIF, ICC or text
chunks) is written, so uploads are smaller than the PNGs the logo pipeline
produces. Filenames are `<uuid>-<sha256>.jpg`; user-provided names never reach
the filesystem. Errors: **415** unsupported MIME type, **413** size or pixel
limit, **400** not a valid or static image, **422** wrong shape or too small for
the slot (the detail names what the slot needs).

The storage code reuses `app/services/organization_logos.py`' session hooks
(`store`, `defer_delete`): files are written before the commit that references
them and obsolete ones are deleted after it; a rollback removes the new file and
keeps the old one. Replacing or clearing a slot, and deleting the edition, retire
the files they unreference.

Configure `EDITION_ARTWORK_PUBLIC_ROOT` (default `./uploads/public/editions`).
The backend serves `GET /uploads/editions/<name>.jpg` locally (Vite proxies
`/uploads`) with `image/jpeg`, `nosniff` and an immutable one-year cache (names
are content-addressed and never reused). In production Caddy should serve the same
directory at `/uploads/editions/` with those headers. This is a **sibling
directory in the same persistent public volume** as `/uploads/organizations/`
(`tjorim/apps#262`): mount the volume so `public/editions` is writable by the API
and add the route next to the logo one. No pending root is needed.

After a crash or a logged deletion failure, from `backend/`:

```sh
uv run python -m app.services.edition_artwork
```

removes unreferenced files. It takes the same PostgreSQL advisory lock as every
artwork writer (`pg_advisory_xact_lock(1224)`), so it cannot race an in-flight
upload. Back up the database and the artwork root together.

## API

- `POST /api/editions/{id}/artwork/{slot}` (`slot` is `flyer`, `hero` or `share`):
  admin only, multipart field `file`, returns the admin `EditionOut`.
- `DELETE /api/editions/{id}/artwork/{slot}`: admin only, empties the slot and
  deletes its file; clearing an empty slot is a no-op. Returns `EditionOut`.
- `GET /uploads/editions/{name}`: public JPEGs only.

`EditionOut` and the public `EditionPublicOut` (`/api/editions/active`,
`/upcoming`) expose `flyer_image`, `hero_image` and `share_image` (a path, or
`null` for the static default). MCP `get_edition` returns the same fields; image
upload and clearing are browser/REST only, because MCP tools take no binary
payloads. Each change writes an `edition_artwork_updated` audit entry
(`slot`, `operation`) and invalidates the rendered home page.

## Frontend and public render

* `MaintenancePage` shows the active edition's `flyer_image`; when it fails to load
  it falls back to `/images/flyer.jpg`, then to the placeholder.
* `useEditionHeroImage` publishes the validated hero path as the CSS variable
  `--edition-hero-image` on `<html>`; `theme-refresh.css` and `maintenancePage.css`
  read it with the static photo as the `var()` fallback.
* `app/routers/public_pages.py` rewrites `og:image`/`twitter:image` to
  `PUBLIC_URL` + the share image (else the hero) and `jsonld_service` uses it for
  `Event.image`; `JsonLd.tsx` mirrors this client-side. With nothing uploaded the
  shell keeps `/images/og-image.jpg`. Crawlers see the change after the
  60-second render cache (immediately after the mutation's NOTIFY); verify with
  the Facebook Sharing Debugger and re-scrape.
