"""Logo validation, private access, publication and transactional cleanup."""

from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

from app.config import settings
from app.services import exhibitor_changes, exhibitor_logos
from app.services.errors import ServiceError
from tests import test_my_exhibitors
from tests.conftest import ADMIN_HEADERS
from tests.test_exhibitor_changes import decision, login, propose

manager = test_my_exhibitors.manager


def image_bytes(format="PNG", size=(32, 32), color="red"):
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format=format)
    return output.getvalue()


@pytest.fixture(autouse=True)
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "exhibitor_logo_public_root", str(tmp_path / "public"))
    monkeypatch.setattr(settings, "exhibitor_logo_pending_root", str(tmp_path / "pending"))
    return exhibitor_logos.roots()


async def upload(client, row, data=None, mime="image/png", admin=False):
    return await client.post(
        f"/api/{'exhibitors' if admin else 'me/exhibitors'}/{row.id}/logo",
        files={"file": ("untrusted.svg", data if data is not None else image_bytes(), mime)},
        headers=ADMIN_HEADERS if admin else {},
    )


@pytest.mark.parametrize("mime,format", [("image/png", "PNG"), ("image/jpeg", "JPEG"), ("image/webp", "WEBP")])
def test_reencoding(mime, format):
    encoded = exhibitor_logos.encode(image_bytes(format, (2200, 100)), mime)
    with Image.open(BytesIO(encoded)) as image:
        assert image.format == "PNG"
        assert max(image.size) <= 2048
        assert not image.getexif()


@pytest.mark.parametrize(
    "data,mime,status",
    [
        (b"<svg/>", "image/svg+xml", 415),
        (b"<svg/>", "image/png", 400),
        (b"garbage", "image/jpeg", 400),
        (b"x" * (exhibitor_logos.LIMIT + 1), "image/png", 413),
        (image_bytes(size=(4001, 4000)), "image/png", 413),
        (image_bytes("PNG"), "image/jpeg", 400),
    ],
    ids=["svg", "disguised-svg", "corrupt", "size", "pixels", "mime-mismatch"],
)
async def test_invalid_uploads(client, manager, storage, data, mime, status):
    await login(client, manager)
    response = await upload(client, manager[1][0], data, mime)
    assert response.status_code == status
    assert not list(storage[0].iterdir()) and not list(storage[1].iterdir())


async def test_private_accept_and_retry(client, db_session, manager, storage):
    await login(client, manager)
    row = manager[1][0]
    await upload(client, row, admin=True)
    await db_session.refresh(row)
    old_url = row.image
    old_file = storage[0] / old_url.split("/")[-1]
    change = (await upload(client, row, image_bytes(color="blue"))).json()
    pending_file = storage[1] / change["proposed"]["image"]
    assert pending_file.exists() and old_file.exists()
    assert (await client.get(exhibitor_logos.PREFIX + pending_file.name)).status_code == 404
    manager_url = f"/api/me/exhibitors/{row.id}/changes/{change['id']}/logo"
    admin_url = f"/api/exhibitors/changes/{change['id']}/logo"
    assert (await client.get(manager_url)).status_code == 200
    preview = await client.get(admin_url, headers=ADMIN_HEADERS)
    assert preview.headers["cache-control"] == "no-store" and preview.headers["content-type"] == "image/png"
    await db_session.refresh(row)
    assert row.image == old_url
    accepted = await decision(client, change, "accepted")
    assert accepted.status_code == 200
    assert (await decision(client, change, "accepted")).status_code == 200
    assert not pending_file.exists() and not old_file.exists()
    await db_session.refresh(row)
    assert row.image != old_url
    public = await client.get(row.image)
    assert public.status_code == 200 and public.content == preview.content
    assert (await client.get(admin_url, headers=ADMIN_HEADERS)).status_code == 404


async def test_replace_reject_supersede_and_delete(client, db_session, manager, storage):
    await login(client, manager)
    row = manager[1][0]
    text = (await propose(client, row, website="https://proposal.example")).json()
    first = (await upload(client, row)).json()
    assert first["proposed"]["website"] == text["proposed"]["website"]
    second = (await upload(client, row)).json()
    assert not (storage[1] / first["proposed"]["image"]).exists()
    assert len(list(storage[1].iterdir())) == 1
    assert (await decision(client, second, "rejected")).status_code == 200
    assert not list(storage[1].iterdir())
    third = (await upload(client, row)).json()
    assert (await upload(client, row, admin=True)).status_code == 200
    assert not (storage[1] / third["proposed"]["image"]).exists()
    assert (await decision(client, third, "accepted")).status_code == 409
    await upload(client, row)
    assert (
        await client.put(f"/api/exhibitors/{row.id}", json={"image": "/images/legacy.svg"}, headers=ADMIN_HEADERS)
    ).status_code == 200
    assert not list(storage[0].iterdir()) and not list(storage[1].iterdir())
    await upload(client, row)
    await upload(client, row, admin=True)
    await upload(client, row)
    assert (await client.delete(f"/api/exhibitors/{row.id}", headers=ADMIN_HEADERS)).status_code == 204
    assert not list(storage[0].iterdir()) and not list(storage[1].iterdir())


async def test_text_replacement_removes_logo(client, manager, storage):
    await login(client, manager)
    row = manager[1][0]
    await upload(client, row)
    assert (await propose(client, row, website="https://new.example")).status_code == 200
    assert not list(storage[1].iterdir())


async def test_authorization(client, manager, storage):
    row = manager[1][0]
    assert (await upload(client, row)).status_code == 401
    assert (await upload(client, row, admin=False)).status_code == 401
    await login(client, manager)
    assert (await upload(client, manager[1][2])).status_code == 404
    change = (await upload(client, row)).json()
    assert (await client.get(f"/api/me/exhibitors/{manager[1][2].id}/changes/{change['id']}/logo")).status_code == 404


async def test_rollback_and_crash_reconciliation(db_session, manager, storage):
    await exhibitor_changes.lock_exhibitor(db_session, manager[1][0].id)
    path = storage[1] / exhibitor_logos.store(db_session, storage[1], image_bytes())
    assert path.exists()
    await db_session.rollback()
    assert not path.exists()
    # A process crash has no chance to invoke rollback hooks.
    orphan = storage[0] / f"{uuid4().hex}-{'0' * 64}.png"
    orphan.write_bytes(image_bytes())
    assert await exhibitor_logos.reconcile(db_session) == 1
    assert not orphan.exists()


async def test_failed_commit_preserves_previous(client, db_session, manager, storage, monkeypatch):
    await login(client, manager)
    row = manager[1][0]
    change = (await upload(client, row)).json()
    original = storage[1] / change["proposed"]["image"]

    async def fail():
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", fail)
    with pytest.raises(RuntimeError, match="commit failed"):
        await exhibitor_changes.decide(db_session, change["id"], "accepted", None, actor="admin")
    await db_session.rollback()
    assert original.exists() and not list(storage[0].iterdir())


def test_separate_roots(monkeypatch, storage):
    monkeypatch.setattr(settings, "exhibitor_logo_pending_root", str(storage[0] / "pending"))
    with pytest.raises(ServiceError):
        exhibitor_logos.roots()


async def test_staff_roles_do_not_grant_logo_rights(client, manager, monkeypatch):
    from app import auth
    from app.auth import require_admin
    from app.main import app

    await login(client, manager)
    row = manager[1][0]
    change = (await upload(client, row)).json()
    app.dependency_overrides.pop(require_admin)
    claims = {"sub": "reviewer", "realm_access": {"roles": []}}

    async def decode(_token):
        return claims

    monkeypatch.setattr(auth, "decode_token", decode)
    url = f"/api/exhibitors/changes/{change['id']}/logo"
    assert (await client.get(url)).status_code == 401
    for role in ["member", "volunteer"]:
        claims["realm_access"]["roles"] = [role]
        assert (await client.get(url, headers=ADMIN_HEADERS)).status_code == 403
        assert (await upload(client, row, admin=True)).status_code == 403
    claims["realm_access"]["roles"] = ["admin"]
    assert (await client.get(url, headers=ADMIN_HEADERS)).status_code == 200
    assert (await upload(client, row, admin=True)).status_code == 200


def test_metadata_and_animation():
    output = BytesIO()
    exif = Image.Exif()
    exif[0x010E] = "Private metadata"
    Image.new("RGB", (10, 10)).save(output, "JPEG", exif=exif)
    with Image.open(BytesIO(exhibitor_logos.encode(output.getvalue(), "image/jpeg"))) as decoded:
        assert not decoded.getexif() and "exif" not in decoded.info
    animated = BytesIO()
    Image.new("RGB", (10, 10), "red").save(
        animated, "PNG", save_all=True, append_images=[Image.new("RGB", (10, 10), "blue")]
    )
    with pytest.raises(ServiceError, match="static"):
        exhibitor_logos.encode(animated.getvalue(), "image/png")


@pytest.mark.parametrize(
    "name", ["..%2Fsecret.png", "%2E%2E%2Fsecret.png", "..%5Csecret.png", "not-a-managed-logo.png"]
)
async def test_public_path_traversal(client, storage, name):
    assert (await client.get(exhibitor_logos.PREFIX + name)).status_code == 404


async def test_public_logo_cannot_follow_private_symlink(client, storage):
    name = f"{uuid4().hex}-{'0' * 64}.png"
    private = storage[1] / name
    private.write_bytes(image_bytes())
    (storage[0] / name).symlink_to(private)
    assert (await client.get(exhibitor_logos.PREFIX + name)).status_code == 404
    assert private.exists()
