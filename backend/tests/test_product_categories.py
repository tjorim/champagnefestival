"""Product categories as admin-managed data (#1222): REST, MCP and the products that use them."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.mcp.admin import product_categories as mcp_categories
from app.mcp.admin import products as mcp_products
from app.models import AuditEntry
from tests.conftest import DEFAULT_TEST_PRODUCT_CATEGORIES
from tests.helpers import ADMIN_HEADERS, _create_event, mcp_session_factory


async def _create(client, **body):
    return await client.post("/api/product-categories", json={"label_language": "nl", **body}, headers=ADMIN_HEADERS)


async def _product(client, event_id: str, category: str, **overrides):
    return await client.post(
        "/api/products",
        json={"event_id": event_id, "price": "5.00", "category": category, "name_en": "Item", **overrides},
        headers=ADMIN_HEADERS,
    )


async def test_list_is_public_ordered_and_resolves_labels_for_the_locale(client):
    for key, order, nl, fr in (("zeta", 5, "Zeta", None), ("alpha", 5, "Alfa", "Alpha"), ("first", 0, "Eerste", None)):
        response = await _create(client, key=key, sort_order=order, label_nl=nl, label_fr=fr)
        assert response.status_code == 201, response.text

    listed = (await client.get("/api/product-categories", params={"locale": "fr"})).json()
    keys = [category["key"] for category in listed]
    assert keys.index("first") < keys.index("alpha") < keys.index("zeta")
    labels = {category["key"]: category["label"] for category in listed}
    assert labels["alpha"] == "Alpha"
    assert labels["zeta"] == "Zeta"  # no French label: the original language
    assert (await client.get("/api/product-categories", params={"locale": "de"})).status_code == 422


async def test_create_validates_the_key_and_the_original_label(client):
    created = await _create(client, key="soft-drinks_2", label_language="en", label_en="Soft drinks", sort_order=3)
    assert created.status_code == 201, created.text
    assert (created.json()["label"], created.json()["sort_order"]) == ("Soft drinks", 3)

    assert (await _create(client, key="soft-drinks_2", label_nl="Dubbel")).status_code == 409
    for bad in (
        {"key": "Soft", "label_nl": "x"},
        {"key": "1soft", "label_nl": "x"},
        {"key": "nolabel"},
        {"key": "wrong-original", "label_language": "fr", "label_nl": "Seulement"},
        {"key": "blank", "label_nl": "   "},
    ):
        assert (await _create(client, **bad)).status_code == 422, bad


async def test_update_edits_single_labels_and_keeps_the_key(client):
    await _create(client, key="soft", label_nl="Frisdrank")

    translated = await client.put(
        "/api/product-categories/soft", json={"label_en": "Soft drinks", "sort_order": 7}, headers=ADMIN_HEADERS
    )
    assert translated.status_code == 200
    assert (translated.json()["label_nl"], translated.json()["label_en"]) == ("Frisdrank", "Soft drinks")

    assert (
        await client.put("/api/product-categories/soft", json={"label_nl": ""}, headers=ADMIN_HEADERS)
    ).status_code == 400
    assert (
        await client.put("/api/product-categories/soft", json={"key": "x"}, headers=ADMIN_HEADERS)
    ).status_code == 422
    assert (
        await client.put("/api/product-categories/missing", json={"sort_order": 1}, headers=ADMIN_HEADERS)
    ).status_code == 404


async def test_products_must_use_an_existing_category(client):
    event = await _create_event(client, edition_id="edition-product-category")

    unknown = await _product(client, event["id"], "nope")
    assert unknown.status_code == 422
    assert "Unknown product category" in unknown.text

    await _create(client, key="soft", label_nl="Frisdrank")
    created = await _product(client, event["id"], "soft")
    assert created.status_code == 201
    assert created.json()["category"] == "soft"

    moved = await client.put(f"/api/products/{created.json()['id']}", json={"category": "food"}, headers=ADMIN_HEADERS)
    assert moved.status_code == 200
    assert moved.json()["category"] == "food"
    missing = await client.put(
        f"/api/products/{created.json()['id']}", json={"category": "nope"}, headers=ADMIN_HEADERS
    )
    assert missing.status_code == 422


async def test_delete_is_refused_while_products_use_the_category_or_the_code_depends_on_it(client):
    event = await _create_event(client, edition_id="edition-product-category-delete")
    await _create(client, key="soft", label_nl="Frisdrank")
    product = (await _product(client, event["id"], "soft")).json()

    in_use = await client.delete("/api/product-categories/soft", headers=ADMIN_HEADERS)
    assert in_use.status_code == 409
    assert "1 product(s)" in in_use.text

    champagne = await client.delete("/api/product-categories/champagne", headers=ADMIN_HEADERS)
    assert champagne.status_code == 409
    assert "delivery tracking" in champagne.text

    await client.put(f"/api/products/{product['id']}", json={"category": "food"}, headers=ADMIN_HEADERS)
    assert (await client.delete("/api/product-categories/soft", headers=ADMIN_HEADERS)).status_code == 204
    keys = [c["key"] for c in (await client.get("/api/product-categories")).json()]
    assert "soft" not in keys
    assert set(DEFAULT_TEST_PRODUCT_CATEGORIES) <= set(keys)


async def test_writes_require_a_signed_in_admin_but_the_list_does_not(unauth_client):
    body = {"key": "soft", "label_nl": "Frisdrank"}
    assert (await unauth_client.post("/api/product-categories", json=body)).status_code == 401
    assert (await unauth_client.put("/api/product-categories/food", json={"sort_order": 1})).status_code == 401
    assert (await unauth_client.delete("/api/product-categories/food")).status_code == 401
    assert (await unauth_client.get("/api/product-categories")).status_code == 200


async def test_writes_require_the_admin_role(forbidden_client):
    body = {"key": "soft", "label_nl": "Frisdrank"}
    assert (await forbidden_client.post("/api/product-categories", json=body)).status_code == 403
    assert (await forbidden_client.delete("/api/product-categories/food")).status_code == 403


async def test_changes_are_audited(client, db_session):
    await _create(client, key="soft", label_nl="Frisdrank")
    await client.put("/api/product-categories/soft", json={"label_en": "Soft"}, headers=ADMIN_HEADERS)
    await client.delete("/api/product-categories/soft", headers=ADMIN_HEADERS)

    actions = (
        (await db_session.execute(select(AuditEntry.action).where(AuditEntry.resource_type == "product_category")))
        .scalars()
        .all()
    )
    assert sorted(actions) == ["product_category_created", "product_category_deleted", "product_category_updated"]


async def test_mcp_tools_manage_categories_and_products_use_them(client, db_session):
    event = await _create_event(client, edition_id="edition-product-category-mcp")
    factory = mcp_session_factory(db_session)

    created = await mcp_categories.create_product_category(
        factory, "admin-1", key="soft", label_language="nl", label_nl="Frisdrank"
    )
    assert created["key"] == "soft"
    updated = await mcp_categories.update_product_category(factory, "admin-1", "soft", label_en="Soft drinks")
    assert updated["label_en"] == "Soft drinks"
    english = await mcp_categories.list_product_categories(factory, "en")
    assert {c["key"]: c["label"] for c in english["product_categories"]}["soft"] == "Soft drinks"

    with pytest.raises(ValueError, match="already exists"):
        await mcp_categories.create_product_category(
            factory, "admin-1", key="soft", label_language="nl", label_nl="Nog eens"
        )

    product = await mcp_products.create_product(
        factory, "admin-1", event_id=event["id"], price=2.5, category="soft", name_en="Cola"
    )
    with pytest.raises(ValueError, match="1 product"):
        await mcp_categories.delete_product_category(factory, "admin-1", "soft")
    with pytest.raises(ValueError, match="Unknown product category"):
        await mcp_products.update_product(factory, "admin-1", product["id"], category="nope")
    with pytest.raises(ValueError, match="delivery tracking"):
        await mcp_categories.delete_product_category(factory, "admin-1", "champagne")

    await mcp_products.update_product(factory, "admin-1", product["id"], category="food")
    assert (await mcp_categories.delete_product_category(factory, "admin-1", "soft"))["deleted"] is True
