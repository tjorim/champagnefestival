"""FastMCP v4 MCP server for Champagnefestival event operations.

Exposes operational tools for answering:
- Who sits where?
- What did a guest or table order?
- Which orders/champagne are already delivered?
- Which tables still have undelivered champagne?
- How many guests are checked in?

...and, for admins, full write/management parity with the admin REST API:
editions, events, venues, rooms, table types, tables, layouts, areas, FAQ,
settings, organizations, people, members, volunteers, registrations, and
read access to the audit trail. See ``app.mcp.admin`` for the write tool
implementations — every mutation goes through the same ``write_audit_entry``
path the REST admin routes use, so the audit log is complete regardless of
which surface made the change.

Auth tiers (sourced from bearer JWT ``realm_access.roles``):
- ``admin``     – full operational detail and all write tools.
- ``volunteer`` – event-day details: seating, orders, check-in, no sensitive PII.
- ``public``    – no PII; only edition/event/venue overview tools.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.transforms.search import BM25SearchTransform
from fastmcp.tools.base import Tool
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.mcp.auth import build_keycloak_auth as build_keycloak_auth
from app.mcp.capabilities import tool_annotations, tool_auth
from app.mcp.middleware import ToolFailureMiddleware, without_body_validation_payload
from app.mcp.tools.content import ContentTools
from app.mcp.tools.editions import EditionsTools
from app.mcp.tools.event_day import EventDayTools
from app.mcp.tools.people import PeopleTools
from app.mcp.tools.platform import PlatformTools
from app.mcp.tools.polls import PollsTools
from app.mcp.tools.public import PublicTools
from app.mcp.tools.registrations import RegistrationsTools
from app.mcp.tools.signage import SignageTools
from app.mcp.tools.venue import VenueTools
from app.version import APP_VERSION

logger = logging.getLogger(__name__)

SEARCH_TOOL_NAME = "search_tools"
CALL_TOOL_NAME = "call_tool"

# Tools listed alongside search_tools/call_tool. whoami answers "which role am I?"
# and get_active_edition is the anchor most sessions start from (the edition and
# event ids every other tool takes); both are public and have tiny schemas.
ALWAYS_VISIBLE_TOOLS = ["whoami", "get_active_edition"]


def _search_serializer(
    tools: Sequence[Tool],
) -> list[dict[str, Any]]:
    """Custom serializer for BM25SearchTransform that adds role metadata.

    Adds access ({"role": ...}, the same shape as the capability manifest),
    effect and requires_confirmation to each tool in search results so clients
    can see authorization requirements without calling each tool.
    """
    from app.mcp.capabilities import tool_effect, tool_required_role

    return [
        {
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.parameters,
            "access": {"role": tool_required_role(tool.name)},
            "effect": tool_effect(tool.name),
            # Same fields as the capability manifest (contract v1); no tool here has a
            # server-side confirmation step.
            "requires_confirmation": False,
        }
        for tool in tools
    ]


class ChampagneFestivalMcpBackend(
    PublicTools,
    EventDayTools,
    VenueTools,
    EditionsTools,
    PollsTools,
    ContentTools,
    SignageTools,
    PeopleTools,
    RegistrationsTools,
    PlatformTools,
):
    """Thin assembler: the per-domain tool mixins in ``app.mcp.tools`` over one shared session factory and caller resolution."""


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_mcp_server(
    session_factory: async_sessionmaker | None = None,
    auth: Any = None,
) -> FastMCP:
    """Create and return a configured :class:`FastMCP` server.

    Parameters
    ----------
    session_factory:
        An ``async_sessionmaker`` to use for database access.
        Defaults to the application's shared ``async_session_factory``.
    auth:
        An optional FastMCP ``AuthProvider`` (e.g. ``KeycloakAuthProvider``).
        When ``None``, the server runs without authentication enforcement;
        all tools will resolve to the ``'public'`` role unless a bearer
        token is provided via another mechanism.
    """
    if session_factory is None:
        from app.db.session import async_session_factory as _default_factory

        session_factory = _default_factory

    backend = ChampagneFestivalMcpBackend(session_factory)

    mcp = FastMCP(
        name="Champagnefestival",
        instructions=(
            "Operational tools for Champagnefestival event staff. Read-only tools cover "
            "seating, orders, champagne delivery, and check-in status; most require the "
            "'volunteer' or 'admin' role. Admins additionally get full write/management "
            "parity with the admin REST API: editions, events, venues, rooms, table types, "
            "tables, layouts, areas, FAQ, settings, organizations, people, members, volunteers, "
            "registrations, and the audit trail. Most tools are hidden: describe what you "
            "need to search_tools, then run the tool it returns with call_tool (name plus "
            "arguments). Only tools your role may use are returned. whoami and "
            "get_active_edition are always available directly."
        ),
        auth=auth,
        version=APP_VERSION,
        # Every admin tool's business errors are raised as `MCPToolError`
        # (app.mcp.utils), which FastMCP re-raises verbatim regardless of this
        # setting. Masking here is the safety net for exceptions nobody wrapped
        # that way — e.g. a raw driver `IntegrityError` — which would otherwise
        # have their full str() (SQL, row contents) embedded in the tool result.
        mask_error_details=True,
        middleware=[ToolFailureMiddleware(search_tool_name=SEARCH_TOOL_NAME, call_tool_name=CALL_TOOL_NAME)],
        transforms=[
            BM25SearchTransform(
                max_results=10,
                always_visible=ALWAYS_VISIBLE_TOOLS,
                search_tool_name=SEARCH_TOOL_NAME,
                call_tool_name=CALL_TOOL_NAME,
                search_result_serializer=_search_serializer,
            )
        ],
    )

    def register_tool(fn: Any) -> None:
        mcp.tool(
            without_body_validation_payload(fn),
            annotations=tool_annotations(fn.__name__),
            auth=tool_auth(fn.__name__),
        )

    # Register all tools with explicit safety metadata for MCP clients.
    register_tool(backend.whoami)
    register_tool(backend.get_active_edition)
    register_tool(backend.list_editions)
    register_tool(backend.get_event_schedule)
    register_tool(backend.list_event_categories)
    register_tool(backend.list_product_categories)
    register_tool(backend.get_venue_plan_summary)
    register_tool(backend.find_stand)
    register_tool(backend.find_guest)
    register_tool(backend.get_guest_registration)
    register_tool(backend.get_table_seating)
    register_tool(backend.resolve_table_reference)
    register_tool(backend.get_table_order_summary)
    register_tool(backend.get_guest_order_status)
    register_tool(backend.get_champagne_delivery_summary)
    register_tool(backend.get_undelivered_champagne_by_table)
    register_tool(backend.get_check_in_summary)

    # Register all admin write/management tools (see app.mcp.admin)
    register_tool(backend.create_venue)
    register_tool(backend.list_venues)
    register_tool(backend.get_venue)
    register_tool(backend.update_venue)
    register_tool(backend.delete_venue)
    register_tool(backend.create_room)
    register_tool(backend.bulk_create_rooms)
    register_tool(backend.list_rooms)
    register_tool(backend.get_room)
    register_tool(backend.update_room)
    register_tool(backend.delete_room)
    register_tool(backend.create_table_type)
    register_tool(backend.bulk_create_table_types)
    register_tool(backend.list_table_types)
    register_tool(backend.get_table_type)
    register_tool(backend.update_table_type)
    register_tool(backend.delete_table_type)
    register_tool(backend.create_table)
    register_tool(backend.bulk_create_tables)
    register_tool(backend.list_tables)
    register_tool(backend.get_table)
    register_tool(backend.update_table)
    register_tool(backend.delete_table)
    register_tool(backend.create_layout)
    register_tool(backend.copy_layout)
    register_tool(backend.bulk_create_layouts)
    register_tool(backend.list_layouts)
    register_tool(backend.get_layout)
    register_tool(backend.delete_layout)
    register_tool(backend.save_layout_revision)
    register_tool(backend.list_layout_revisions)
    register_tool(backend.get_layout_revision)
    register_tool(backend.compare_layout_revisions)
    register_tool(backend.preview_layout_restore)
    register_tool(backend.restore_layout_revision)
    register_tool(backend.create_area)
    register_tool(backend.list_areas)
    register_tool(backend.get_area)
    register_tool(backend.update_area)
    register_tool(backend.delete_area)
    register_tool(backend.create_edition)
    register_tool(backend.get_edition)
    register_tool(backend.update_edition)
    register_tool(backend.delete_edition)
    register_tool(backend.create_event)
    register_tool(backend.get_event)
    register_tool(backend.update_event)
    register_tool(backend.delete_event)
    register_tool(backend.create_event_category)
    register_tool(backend.update_event_category)
    register_tool(backend.delete_event_category)
    register_tool(backend.create_product_category)
    register_tool(backend.update_product_category)
    register_tool(backend.delete_product_category)
    register_tool(backend.create_product)
    register_tool(backend.get_product)
    register_tool(backend.list_products)
    register_tool(backend.update_product)
    register_tool(backend.delete_product)
    register_tool(backend.create_poll_option)
    register_tool(backend.list_poll_options)
    register_tool(backend.update_poll_option)
    register_tool(backend.delete_poll_option)
    register_tool(backend.reorder_poll_options)
    register_tool(backend.list_poll_questions)
    register_tool(backend.create_poll_question)
    register_tool(backend.update_poll_question)
    register_tool(backend.delete_poll_question)
    register_tool(backend.reorder_poll_questions)
    register_tool(backend.copy_poll_questions)
    register_tool(backend.list_poll_orders)
    register_tool(backend.set_volunteer_poll_order)
    register_tool(backend.create_faq_item)
    register_tool(backend.list_faq_items)
    register_tool(backend.update_faq_item)
    register_tool(backend.delete_faq_item)
    register_tool(backend.reorder_faq_items)
    register_tool(backend.list_announcements)
    register_tool(backend.create_announcement)
    register_tool(backend.update_announcement)
    register_tool(backend.reorder_announcements)
    register_tool(backend.delete_announcement)
    register_tool(backend.list_composed_messages)
    register_tool(backend.get_composed_message)
    register_tool(backend.create_composed_message)
    register_tool(backend.update_composed_message)
    register_tool(backend.schedule_composed_message)
    register_tool(backend.list_policies)
    register_tool(backend.get_policy)
    register_tool(backend.preview_policy_markdown)
    register_tool(backend.create_policy_draft)
    register_tool(backend.update_policy_draft)
    register_tool(backend.discard_policy_draft)
    register_tool(backend.publish_policy_draft)
    register_tool(backend.list_signage_channels)
    register_tool(backend.get_signage_channel)
    register_tool(backend.create_signage_channel)
    register_tool(backend.update_signage_channel)
    register_tool(backend.delete_signage_channel)
    register_tool(backend.list_signage_templates)
    register_tool(backend.get_signage_template)
    register_tool(backend.create_signage_template)
    register_tool(backend.update_signage_template)
    register_tool(backend.delete_signage_template)
    register_tool(backend.list_signage_slides)
    register_tool(backend.get_signage_slide)
    register_tool(backend.create_signage_slide)
    register_tool(backend.update_signage_slide)
    register_tool(backend.delete_signage_slide)
    register_tool(backend.reorder_signage_slides)
    register_tool(backend.get_signage_playlist)
    register_tool(backend.preview_signage_playlist)
    register_tool(backend.get_signage_video_capability)
    register_tool(backend.list_signage_video_exports)
    register_tool(backend.get_signage_video_export)
    register_tool(backend.cancel_signage_video_export)
    register_tool(backend.list_waitlist_entries)
    register_tool(backend.mark_waitlist_entry_handled)
    register_tool(backend.delete_waitlist_entry)
    register_tool(backend.get_settings)
    register_tool(backend.set_member_indicators)
    register_tool(backend.set_maintenance_mode)
    register_tool(backend.list_stamp_card_types)
    register_tool(backend.save_stamp_card_type)
    register_tool(backend.get_person_stamp_cards)
    register_tool(backend.set_stamp_reward_handed_out)
    register_tool(backend.select_stamp_card_type)

    register_tool(backend.list_organization_changes)
    register_tool(backend.decide_organization_change)
    register_tool(backend.create_organization)
    register_tool(backend.get_organization)
    register_tool(backend.list_organizations)
    register_tool(backend.update_organization)
    register_tool(backend.delete_organization)
    register_tool(backend.create_person)
    register_tool(backend.get_person)
    register_tool(backend.update_person)
    register_tool(backend.delete_person)
    register_tool(backend.merge_people)
    register_tool(backend.create_member)
    register_tool(backend.get_member)
    register_tool(backend.list_members)
    register_tool(backend.update_member)
    register_tool(backend.deactivate_member)
    register_tool(backend.reactivate_member)
    register_tool(backend.create_volunteer)
    register_tool(backend.get_volunteer)
    register_tool(backend.list_volunteers)
    register_tool(backend.update_volunteer)
    register_tool(backend.deactivate_volunteer)
    register_tool(backend.reactivate_volunteer)
    register_tool(backend.list_registrations)
    register_tool(backend.create_registration)
    register_tool(backend.check_in)
    register_tool(backend.update_registration)
    register_tool(backend.delete_registration)
    register_tool(backend.create_payment_transaction)
    register_tool(backend.list_payment_transactions)
    register_tool(backend.list_audit_entries)
    register_tool(backend.list_audit_resource_types)
    register_tool(backend.create_integration_client)
    register_tool(backend.list_integration_clients)
    register_tool(backend.revoke_integration_client)
    register_tool(backend.rotate_integration_client)

    return mcp


# ---------------------------------------------------------------------------
# Stdio entry point
# ---------------------------------------------------------------------------


def _run_stdio() -> None:  # pragma: no cover
    """Run the MCP server in stdio transport mode for local desktop agents."""
    import asyncio

    mcp = create_mcp_server(auth=None)
    asyncio.run(mcp.run_async(transport="stdio"))


if __name__ == "__main__":  # pragma: no cover
    _run_stdio()
