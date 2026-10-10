"""Admin-uploaded edition flyer, hero and sharing image (#1224)."""

import asyncio
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import settings
from app.models import AuditEntry
from app.services import edition_artwork, editions_service
from app.services.public_render_cache import public_render_cache
from tests.helpers import ADMIN_HEADERS, _create_event

SIZES = {"flyer": (700, 990), "hero": (1900, 1000), "share": (1280, 670)}


def image_bytes(format="PNG", size=(32, 32), color="red", mode="RGB"):
    output = BytesIO()
    Image.new(mode, size, color).save(output, format=format)
    return output.getvalue()


def valid(slot, format="PNG"):
    return image_bytes(format, SIZES[slot])


@pytest.fixture(autouse=True)
def storage(tmp_path, monkeypatch) -> Path:
    monkeypatch.setattr(settings, "edition_artwork_public_root", str(tmp_path / "editions"))
    return edition_artwork.public_root()


@pytest.fixture(autouse=True)
def fixture_shell(monkeypatch):
    monkeypatch.setattr(settings, "frontend_dist_path", str(Path(__file__).parent / "fixtures" / "frontend_dist"))


@pytest.fixture
async def edition(client) -> str:
    await _create_event(client, edition_id="edition-artwork")
    return "edition-artwork"


async def upload(client, edition_id, slot, data=None, mime="image/png", headers=ADMIN_HEADERS):
    return await client.post(
        f"/api/editions/{edition_id}/artwork/{slot}",
        files={"file": ("untrusted.svg", data if data is not None else valid(slot), mime)},
        headers=headers,
    )


def files(storage):
    return sorted(path.name for path in storage.iterdir())


@pytest.mark.parametrize("slot", ["flyer", "hero", "share"])
async def test_upload_serves_reencoded_jpeg_and_exposes_url(client, edition, storage, slot):
    response = await upload(client, edition, slot)
    assert response.status_code == 200
    url = response.json()[f"{slot}_image"]
    assert url.startswith(edition_artwork.PREFIX) and url.endswith(".jpg")
    assert files(storage) == [url.rsplit("/", 1)[1]]
    public = await client.get(url)
    assert public.status_code == 200
    assert public.headers["content-type"] == "image/jpeg" and public.headers["x-content-type-options"] == "nosniff"
    with Image.open(BytesIO(public.content)) as stored:
        assert stored.format == "JPEG" and not stored.getexif()
        if slot == "share":
            assert stored.size == (1200, 630)
    # The other slots are untouched and the public edition response carries the URL.
    admin = (await client.get(f"/api/editions/{edition}", headers=ADMIN_HEADERS)).json()
    assert admin[f"{slot}_image"] == url
    assert [admin[f"{other}_image"] for other in SIZES if other != slot] == [None, None]
    assert (await client.get("/api/editions/active")).json()[f"{slot}_image"] == url


async def test_replace_and_clear_leave_no_orphan(client, edition, storage):
    first = (await upload(client, edition, "flyer")).json()["flyer_image"]
    blue = image_bytes("JPEG", SIZES["flyer"], "blue")
    second = (await upload(client, edition, "flyer", blue, "image/jpeg")).json()["flyer_image"]
    assert first != second and files(storage) == [second.rsplit("/", 1)[1]]
    assert (await client.get(first)).status_code == 404
    cleared = await client.delete(f"/api/editions/{edition}/artwork/flyer", headers=ADMIN_HEADERS)
    assert cleared.status_code == 200 and cleared.json()["flyer_image"] is None
    assert files(storage) == [] and (await client.get(second)).status_code == 404
    # Clearing an empty slot converges on the same state.
    again = await client.delete(f"/api/editions/{edition}/artwork/flyer", headers=ADMIN_HEADERS)
    assert again.status_code == 200 and again.json()["flyer_image"] is None


async def test_audit_trail_and_deleting_the_edition_removes_files(client, db_session, edition, storage):
    await upload(client, edition, "flyer")
    await upload(client, edition, "share")
    await client.delete(f"/api/editions/{edition}/artwork/share", headers=ADMIN_HEADERS)
    entries = (await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "edition_artwork_updated"))).all()
    assert sorted((entry.details["slot"], entry.details["operation"]) for entry in entries) == [
        ("flyer", "upload"),
        ("share", "clear"),
        ("share", "upload"),
    ]
    assert len(files(storage)) == 1
    assert (await client.delete(f"/api/editions/{edition}", headers=ADMIN_HEADERS)).status_code == 204
    assert files(storage) == []


@pytest.mark.parametrize(
    "slot,data,mime,status",
    [
        ("flyer", b"<svg/>", "image/svg+xml", 415),
        ("flyer", b"<svg/>", "image/png", 400),
        ("flyer", b"garbage", "image/jpeg", 400),
        ("flyer", image_bytes("PNG"), "image/jpeg", 400),
        ("flyer", b"x" * (edition_artwork.LIMIT + 1), "image/png", 413),
        ("flyer", image_bytes("PNG", (7000, 6000), mode="L"), "image/png", 413),
        ("flyer", image_bytes("PNG", (990, 700)), "image/png", 422),
        ("flyer", image_bytes("PNG", (200, 280)), "image/png", 422),
        ("hero", image_bytes("PNG", (700, 990)), "image/png", 422),
        ("hero", image_bytes("PNG", (800, 420)), "image/png", 422),
        ("share", image_bytes("PNG", (1200, 900)), "image/png", 422),
        ("share", image_bytes("PNG", (600, 314)), "image/png", 422),
    ],
    ids=[
        "svg",
        "disguised-svg",
        "corrupt",
        "mime-mismatch",
        "size",
        "pixels",
        "landscape-flyer",
        "small-flyer",
        "portrait-hero",
        "small-hero",
        "wrong-ratio-share",
        "small-share",
    ],
)
async def test_invalid_uploads_are_rejected_without_files(client, edition, storage, slot, data, mime, status):
    response = await upload(client, edition, slot, data, mime)
    assert response.status_code == status
    assert files(storage) == []
    assert (await client.get("/api/editions/active")).json()[f"{slot}_image"] is None


async def test_animated_images_are_rejected(client, edition, storage):
    output = BytesIO()
    frame = Image.new("RGB", SIZES["hero"], "red")
    frame.save(output, format="WEBP", save_all=True, append_images=[Image.new("RGB", SIZES["hero"], "blue")])
    response = await upload(client, edition, "hero", output.getvalue(), "image/webp")
    assert response.status_code == 400 and files(storage) == []


async def test_transparent_png_is_flattened_onto_white(client, edition, storage):
    data = image_bytes("PNG", SIZES["flyer"], (0, 0, 0, 0), mode="RGBA")
    url = (await upload(client, edition, "flyer", data)).json()["flyer_image"]
    with Image.open(BytesIO((await client.get(url)).content)) as stored:
        assert stored.getpixel((10, 10)) == (255, 255, 255)


async def test_oversized_flyer_is_scaled_down_keeping_ratio(client, edition):
    url = (await upload(client, edition, "flyer", image_bytes("JPEG", (3000, 4200)), "image/jpeg")).json()[
        "flyer_image"
    ]
    with Image.open(BytesIO((await client.get(url)).content)) as stored:
        assert stored.size == (2000, 2800)


async def test_unknown_edition_and_slot(client, edition, storage):
    assert (await upload(client, "missing", "flyer")).status_code == 404
    assert (await client.delete("/api/editions/missing/artwork/flyer", headers=ADMIN_HEADERS)).status_code == 404
    assert (await upload(client, edition, "poster", valid("flyer"))).status_code == 422
    assert files(storage) == []


async def test_artwork_requires_authentication(unauth_client, storage):
    assert (await upload(unauth_client, "any", "flyer", headers={})).status_code == 401
    assert (await unauth_client.delete("/api/editions/any/artwork/flyer")).status_code == 401
    assert files(storage) == []


async def test_artwork_requires_admin_role(forbidden_client, storage):
    assert (await upload(forbidden_client, "any", "flyer", headers={})).status_code == 403
    assert (await forbidden_client.delete("/api/editions/any/artwork/flyer")).status_code == 403
    assert files(storage) == []


async def test_public_route_rejects_other_names(client, storage):
    for name in ("../secret.jpg", "plain.jpg", "a" * 32 + "-" + "b" * 64 + ".png"):
        assert (await client.get(edition_artwork.PREFIX + name)).status_code == 404
    (storage / "readme.txt").write_text("private")
    assert (await client.get(edition_artwork.PREFIX + "readme.txt")).status_code == 404


async def test_rollback_removes_new_file_and_keeps_old(client, db_session, edition, storage, monkeypatch):
    old = (await upload(client, edition, "hero")).json()["hero_image"]

    async def failing_commit(db):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.services.editions_service.notify_render_cache_invalidate", failing_commit)
    failed = await upload(client, edition, "hero", image_bytes("JPEG", SIZES["hero"], "blue"), "image/jpeg")
    assert failed.status_code == 500
    await db_session.rollback()  # production closes the request session; the shared test session needs this
    assert files(storage) == [old.rsplit("/", 1)[1]]
    assert (await client.get(old)).status_code == 200


async def test_reconcile_removes_only_unreferenced_files(client, db_session, edition, storage):
    kept = (await upload(client, edition, "share")).json()["share_image"].rsplit("/", 1)[1]
    leftover = storage / f"{'a' * 32}-{'b' * 64}.jpg"
    leftover.write_bytes(b"orphan")
    unrelated = storage / "keep.txt"
    unrelated.write_text("not managed")
    assert await edition_artwork.reconcile(db_session) == 1
    assert not leftover.exists() and unrelated.exists() and (storage / kept).exists()
    assert await edition_artwork.reconcile(db_session) == 0


async def test_concurrent_uploads_leave_one_file_per_slot(client, engine, edition, storage):
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def publish(color):
        async with factory() as session:
            data = await asyncio.to_thread(
                edition_artwork.encode, image_bytes("JPEG", SIZES["flyer"], color), "image/jpeg", "flyer"
            )
            await editions_service.upload_edition_artwork(session, edition, "flyer", data, actor="test")

    await asyncio.gather(*(publish(color) for color in ("red", "blue", "green")))
    live = (await client.get(f"/api/editions/{edition}", headers=ADMIN_HEADERS)).json()["flyer_image"]
    assert files(storage) == [live.rsplit("/", 1)[1]]


# --- Public render: og:image, twitter:image and JSON-LD ---------------------------------


async def test_home_page_uses_share_image_then_hero_then_default(client, edition):
    default = "https://champagnefestival.tjor.im/images/og-image.jpg"

    async def head():
        public_render_cache._entries.clear()
        return (await client.get("/")).text

    page = await head()
    assert f'<meta property="og:image" content="{default}"' in page
    assert default in page and page.count(default) == 3  # og:image, twitter:image, JSON-LD

    hero = (await upload(client, edition, "hero")).json()["hero_image"]
    page = await head()
    expected = f"{settings.public_url}{hero}"
    assert f'<meta property="og:image" content="{expected}"' in page
    assert f'<meta name="twitter:image" content="{expected}"' in page
    assert f'"image":["{expected}"]' in page

    share = (await upload(client, edition, "share")).json()["share_image"]
    page = await head()
    assert f'<meta property="og:image" content="{settings.public_url}{share}"' in page
    assert hero not in page

    await client.delete(f"/api/editions/{edition}/artwork/share", headers=ADMIN_HEADERS)
    await client.delete(f"/api/editions/{edition}/artwork/hero", headers=ADMIN_HEADERS)
    assert default in await head()


async def test_artwork_mutation_invalidates_render_cache(client, edition):
    assert "og-image.jpg" in (await client.get("/")).text
    share = (await upload(client, edition, "share")).json()["share_image"]
    # The mutation queued a NOTIFY; what the listener does on receipt is invalidate().
    public_render_cache.invalidate()
    assert share in (await client.get("/")).text
