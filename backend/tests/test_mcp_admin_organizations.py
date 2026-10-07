"""Tests for the admin (write) organization MCP tools."""

from __future__ import annotations

import pytest

from app.mcp.admin import organizations as mcp_organizations
from app.models import Edition, Venue
from tests.helpers import mcp_session_factory


async def test_create_get_list_organization(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_organizations.create_organization(factory, "admin-1", name="Bollinger", type="producer")
    assert created["name"] == "Bollinger"
    assert created["type"] == "producer"
    organization_id = created["id"]

    fetched = await mcp_organizations.get_organization(factory, organization_id)
    assert fetched["id"] == organization_id

    listed = await mcp_organizations.list_organizations(factory)
    assert any(e["id"] == organization_id for e in listed["organizations"])


async def test_create_organization_rejects_invalid_input(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="name"):
        await mcp_organizations.create_organization(factory, "admin-1", name="")  # min_length=1


async def test_get_organization_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_organizations.get_organization(factory, 999999)


async def test_update_organization_partial(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_organizations.create_organization(
        factory, "admin-1", name="Bollinger", website="https://old.example.com"
    )

    updated = await mcp_organizations.update_organization(
        factory, "admin-1", created["id"], website="https://new.example.com"
    )
    assert updated["website"] == "https://new.example.com"
    assert updated["name"] == "Bollinger"  # untouched fields survive a partial update


async def test_update_organization_not_found(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="not found"):
        await mcp_organizations.update_organization(factory, "admin-1", 999999, website="https://new.example.com")


async def test_delete_organization(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_organizations.create_organization(factory, "admin-1", name="Bollinger")

    result = await mcp_organizations.delete_organization(factory, "admin-1", created["id"])
    assert result == {"deleted": True, "id": created["id"]}

    with pytest.raises(ValueError, match="not found"):
        await mcp_organizations.get_organization(factory, created["id"])


async def test_organization_contact_person(db_session):
    factory = mcp_session_factory(db_session)

    from app.mcp.admin import people as mcp_people

    person = await mcp_people.create_person(factory, "admin-1", name="Alice Contact")

    created = await mcp_organizations.create_organization(
        factory, "admin-1", name="Fine Wines Ltd", type="vendor", contact_person_id=person["id"]
    )
    assert created["contact_person"]["name"] == "Alice Contact"
    assert created["contact_person_id"] == person["id"]

    updated = await mcp_organizations.update_organization(factory, "admin-1", created["id"], clear_contact_person=True)
    assert updated["contact_person"] is None
    assert updated["contact_person_id"] is None


async def test_create_organization_invalid_contact_person(db_session):
    factory = mcp_session_factory(db_session)
    with pytest.raises(ValueError, match="Person not found"):
        await mcp_organizations.create_organization(
            factory, "admin-1", name="Bad Corp", contact_person_id="nonexistent-id"
        )


async def test_update_organization_invalid_contact_person(db_session):
    factory = mcp_session_factory(db_session)
    created = await mcp_organizations.create_organization(factory, "admin-1", name="Bollinger")

    with pytest.raises(ValueError, match="Person not found"):
        await mcp_organizations.update_organization(
            factory, "admin-1", created["id"], contact_person_id="nonexistent-id"
        )


async def test_list_organizations_filters_by_type(db_session):
    factory = mcp_session_factory(db_session)
    producer = await mcp_organizations.create_organization(factory, "admin-1", name="Bollinger", type="producer")
    await mcp_organizations.create_organization(factory, "admin-1", name="Food Truck", type="vendor")

    listed = await mcp_organizations.list_organizations(factory, organization_type="producer")
    ids = [e["id"] for e in listed["organizations"]]
    assert producer["id"] in ids
    assert all(e["type"] == "producer" for e in listed["organizations"])


async def test_update_organization_blocked_retype_to_vendor_while_linked(db_session):
    factory = mcp_session_factory(db_session)

    created = await mcp_organizations.create_organization(factory, "admin-1", name="Bollinger", type="producer")
    organization_id = created["id"]

    db_session.add(Venue(id="venue-1", name="Test Venue"))
    await db_session.flush()
    db_session.add(
        Edition(id="edition-1", year=2099, month="march", venue_id="venue-1", organizations=[organization_id])
    )
    await db_session.commit()

    with pytest.raises(ValueError, match="editions still link"):
        await mcp_organizations.update_organization(factory, "admin-1", organization_id, type="vendor")


async def test_mcp_description_update_and_clear(db_session):
    factory = mcp_session_factory(db_session)
    row = await mcp_organizations.create_organization(
        factory, "admin-1", name="Maison", description_language="fr", description_fr="Bonjour"
    )
    row = await mcp_organizations.update_organization(factory, "admin-1", row["id"], description_en="Hello")
    assert row["description_fr"] == "Bonjour"
    assert row["description_en"] == "Hello"
    with pytest.raises(ValueError, match="original language"):
        await mcp_organizations.update_organization(factory, "admin-1", row["id"], description_fr="")
    row = await mcp_organizations.update_organization(
        factory, "admin-1", row["id"], description_language="", description_fr="", description_en=""
    )
    assert row["description_language"] is None
    assert row["description_fr"] is None
    assert row["description_en"] is None
