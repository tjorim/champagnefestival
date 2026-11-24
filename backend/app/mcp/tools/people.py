"""Admin tools for organizations, people, members, volunteers and stamp cards.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from datetime import date as dt_date

from app.core.dependencies import SortDirection
from app.mcp.admin import members as mcp_admin_members
from app.mcp.admin import organizations as mcp_admin_organizations
from app.mcp.admin import people as mcp_admin_people
from app.mcp.admin import volunteers as mcp_admin_volunteers
from app.mcp.tools.base import McpBackendBase
from app.mcp.utils import dump_response
from app.services.people_listing import PersonSortKey


class PeopleTools(McpBackendBase):
    """Admin tools for organizations, people, members, volunteers and stamp cards."""

    async def list_stamp_card_types(self) -> list[dict]:
        """List stamp card types. Requires admin."""
        self._require_admin()
        from app.services import stamp_cards_service as service

        async with self.session_factory() as db:
            return [item.model_dump() for item in await service.list_types(db)]

    async def save_stamp_card_type(
        self,
        name_nl: str,
        box_count: int,
        reward_label_nl: str,
        type_id: str | None = None,
        name_fr: str | None = None,
        name_en: str | None = None,
        reward_label_fr: str | None = None,
        reward_label_en: str | None = None,
        active: bool = True,
    ) -> dict:
        """Create or replace a stamp card type. Requires admin."""
        self._require_admin()
        from app.schemas import StampCardTypeWrite
        from app.services import stamp_cards_service as service

        body = StampCardTypeWrite(
            name_nl=name_nl,
            box_count=box_count,
            reward_label_nl=reward_label_nl,
            name_fr=name_fr,
            name_en=name_en,
            reward_label_fr=reward_label_fr,
            reward_label_en=reward_label_en,
            active=active,
        )
        async with self.session_factory() as db:
            return (await service.save_type(db, actor=self._actor(), body=body, type_id=type_id)).model_dump()

    async def get_person_stamp_cards(self, person_id: str) -> list[dict]:
        """Return a person's stamp cards and rewards. Requires admin."""
        self._require_admin()
        from app.services import stamp_cards_service as service

        async with self.session_factory() as db:
            return [item.model_dump() for item in await service.list_cards(db, person_id)]

    async def set_stamp_reward_handed_out(self, reward_id: str, handed_out: bool) -> dict:
        """Record or undo reward hand-out. Requires admin."""
        self._require_admin()
        from app.services import stamp_cards_service as service

        async with self.session_factory() as db:
            return (
                await service.set_reward(db, reward_id=reward_id, handed_out=handed_out, actor=self._actor())
            ).model_dump()

    async def select_stamp_card_type(self, type_id: str | None = None) -> dict:
        """Select the active type used for new cards, or clear the selection. Requires admin."""
        self._require_admin()
        from app.schemas import AppSettingsUpdate
        from app.services.settings_service import update_settings

        async with self.session_factory() as db:
            return dump_response(
                await update_settings(db, actor=self._actor(), body=AppSettingsUpdate(stamp_card_type_id=type_id))
            )

    async def list_organization_changes(self) -> dict:
        """List pending organization proposals and current values. Requires admin."""
        self._require_admin()
        from app.services.organization_changes import list_pending

        async with self.session_factory() as db:
            return {"changes": [item.model_dump() for item in await list_pending(db)]}

    async def decide_organization_change(self, change_id: str, decision: str, reason: str | None = None) -> dict:
        """Accept or reject a proposal; repeated identical decisions converge. Requires admin."""
        self._require_admin()
        from app.schemas import OrganizationChangeDecision
        from app.services.errors import ServiceError
        from app.services.organization_changes import decide

        body = OrganizationChangeDecision.model_validate({"decision": decision, "reason": reason})
        async with self.session_factory() as db:
            try:
                return (await decide(db, change_id, body.decision, body.reason, actor=self._actor())).model_dump()
            except ServiceError as exc:
                raise ValueError(str(exc)) from exc

    async def create_organization(
        self,
        name: str,
        image: str = "",
        website: str = "",
        active: bool = True,
        type: str = "vendor",
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        contact_person_id: str | None = None,
    ) -> dict:
        """Create an organization (producer/sponsor/vendor). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_organizations.create_organization(
            self.session_factory,
            self._actor(),
            name=name,
            image=image,
            website=website,
            active=active,
            type=type,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            contact_person_id=contact_person_id,
        )

    async def get_organization(self, organization_id: int) -> dict:
        """Return a single organization. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_organizations.get_organization(self.session_factory, organization_id)

    async def list_organizations(self, organization_type: str | None = None) -> dict:
        """List organizations, optionally filtered by ``organization_type``. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_organizations.list_organizations(self.session_factory, organization_type)

    async def update_organization(
        self,
        organization_id: int,
        name: str | None = None,
        image: str | None = None,
        website: str | None = None,
        active: bool | None = None,
        type: str | None = None,
        description_nl: str | None = None,
        description_fr: str | None = None,
        description_en: str | None = None,
        contact_person_id: str | None = None,
        clear_contact_person: bool = False,
    ) -> dict:
        """Partially update an organization; omitted fields are left unchanged.

        Retyping to ``"vendor"`` fails while any edition still lists this organization
        (vendors may not appear in an edition lineup). ``contact_person_id`` has no
        natural "clear" value, so pass ``clear_contact_person=True`` to unset it.
        Descriptions are literal plain text (600 characters per language), in
        nl/fr/en; the Dutch text is required whenever there is any description. Pass an empty
        string for each description text to clear the description.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_organizations.update_organization(
            self.session_factory,
            self._actor(),
            organization_id,
            name=name,
            image=image,
            website=website,
            active=active,
            type=type,
            description_nl=description_nl,
            description_fr=description_fr,
            description_en=description_en,
            contact_person_id=contact_person_id,
            clear_contact_person=clear_contact_person,
        )

    async def delete_organization(self, organization_id: int) -> dict:
        """Delete an organization (also removed from any edition lineups). Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_organizations.delete_organization(self.session_factory, self._actor(), organization_id)

    async def create_person(
        self,
        name: str,
        email: str | None = None,
        phone: str = "",
        address: str = "",
        roles: list[str] | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        notes: str = "",
    ) -> dict:
        """Create a person. Requires the ``admin`` role.

        Use ``find_guest`` (volunteer/admin) to search existing people by name/email.
        """
        self._require_admin()
        return await mcp_admin_people.create_person(
            self.session_factory,
            self._actor(),
            name=name,
            email=email,
            phone=phone,
            address=address,
            roles=roles,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            notes=notes,
        )

    async def get_person(self, person_id: str) -> dict:
        """Return full admin detail for a single person. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_people.get_person(self.session_factory, person_id)

    async def update_person(
        self,
        person_id: str,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        address: str | None = None,
        roles: list[str] | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        notes: str | None = None,
    ) -> dict:
        """Partially update a person; omitted fields are left unchanged.

        An explicit empty string clears ``national_register_number``/``eid_document_number``.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_people.update_person(
            self.session_factory,
            self._actor(),
            person_id,
            name=name,
            email=email,
            phone=phone,
            address=address,
            roles=roles,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            notes=notes,
        )

    async def delete_person(self, person_id: str) -> dict:
        """Delete a person and their registrations. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_people.delete_person(self.session_factory, self._actor(), person_id)

    async def merge_people(self, person_id: str, duplicate_id: str) -> dict:
        """Merge ``duplicate_id`` into ``person_id``, re-pointing registrations/organization
        contacts/volunteer periods and deleting the duplicate. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_people.merge_people(self.session_factory, self._actor(), person_id, duplicate_id)

    async def create_member(
        self,
        name: str,
        email: str | None = None,
        phone: str = "",
        address: str = "",
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        inactivity_exempt: bool = False,
        inactivity_exempt_note: str = "",
        notes: str = "",
        roles: list[str] | None = None,
    ) -> dict:
        """Create a member (a ``Person`` with the ``member`` role, always added automatically).

        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_members.create_member(
            self.session_factory,
            self._actor(),
            name=name,
            email=email,
            phone=phone,
            address=address,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            notes=notes,
            inactivity_exempt=inactivity_exempt,
            inactivity_exempt_note=inactivity_exempt_note,
            roles=roles,
        )

    async def get_member(self, person_id: str) -> dict:
        """Return a single member. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.get_member(self.session_factory, person_id)

    async def list_members(
        self,
        q: str | None = None,
        active: bool | None = None,
        sort: PersonSortKey | None = None,
        sort_dir: SortDirection = "asc",
        last_attended_before: dt_date | None = None,
        last_attended_after: dt_date | None = None,
    ) -> dict:
        """Search/list members. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.list_members(
            self.session_factory,
            q,
            active,
            sort=sort,
            sort_dir=sort_dir,
            last_attended_before=last_attended_before,
            last_attended_after=last_attended_after,
        )

    async def update_member(
        self,
        person_id: str,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        address: str | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        inactivity_exempt: bool | None = None,
        inactivity_exempt_note: str | None = None,
        notes: str | None = None,
        roles: list[str] | None = None,
    ) -> dict:
        """Partially update a member; omitted fields are left unchanged. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.update_member(
            self.session_factory,
            self._actor(),
            person_id,
            name=name,
            email=email,
            phone=phone,
            address=address,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            notes=notes,
            inactivity_exempt=inactivity_exempt,
            inactivity_exempt_note=inactivity_exempt_note,
            roles=roles,
        )

    async def deactivate_member(self, person_id: str) -> dict:
        """End a person's membership: the member role is retired (recorded in ``retired_roles``); the role, the person, their other roles and registrations are kept. Repeating it changes nothing. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.deactivate_member(self.session_factory, self._actor(), person_id)

    async def reactivate_member(self, person_id: str) -> dict:
        """Undo ``deactivate_member``: the person counts as an active member again. Repeating it changes nothing. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_members.reactivate_member(self.session_factory, self._actor(), person_id)

    async def create_volunteer(
        self,
        name: str,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        help_periods: list[dict] | None = None,
        address: str = "",
    ) -> dict:
        """Create a volunteer (a ``Person`` with the ``volunteer`` role).

        ``help_periods`` is a list of ``{"first_help_day": "YYYY-MM-DD", "last_help_day":
        "YYYY-MM-DD" | None, "notes": str}``. Identity numbers and help periods
        are optional and can be added later; omitted periods default to an empty list.
        ``notes`` is a free-text, admin-only rough schedule/notepad for that period
        (e.g. "Fri: bar, Sat: serving") — there is no structured role/task model.
        Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_volunteers.create_volunteer(
            self.session_factory,
            self._actor(),
            name=name,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            address=address,
            help_periods=help_periods,
        )

    async def get_volunteer(self, volunteer_id: str) -> dict:
        """Return a single volunteer, including help periods. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_volunteers.get_volunteer(self.session_factory, volunteer_id)

    async def list_volunteers(
        self,
        q: str | None = None,
        active: bool | None = None,
    ) -> dict:
        """Search/list volunteers, including help periods. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_volunteers.list_volunteers(self.session_factory, q, active)

    async def update_volunteer(
        self,
        volunteer_id: str,
        name: str | None = None,
        address: str | None = None,
        national_register_number: str | None = None,
        eid_document_number: str | None = None,
        help_periods: list[dict] | None = None,
        oidc_subject: str | None = None,
        clear_oidc_subject: bool = False,
    ) -> dict:
        """Partially update a volunteer; omitted fields are left unchanged.

        Passing ``help_periods`` replaces the full set of help periods; ``[]`` clears them.
        ``oidc_subject`` is the self-service identity link (#1006) — normally
        established by the volunteer themselves; set it here only to hand-link
        a volunteer who can't or won't complete self-registration themselves.
        Since an omitted MCP parameter is indistinguishable from an explicit
        ``null``, pass ``clear_oidc_subject=True`` to unlink a mistaken
        registration instead of passing ``oidc_subject=None`` (which does
        nothing). Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_volunteers.update_volunteer(
            self.session_factory,
            self._actor(),
            volunteer_id,
            name=name,
            address=address,
            national_register_number=national_register_number,
            eid_document_number=eid_document_number,
            help_periods=help_periods,
            oidc_subject=oidc_subject,
            clear_oidc_subject=clear_oidc_subject,
        )

    async def deactivate_volunteer(self, volunteer_id: str) -> dict:
        """End a person's volunteering: the volunteer role is retired (recorded in ``retired_roles``) and open help periods are closed today; the role, the person, their other roles and every period are kept. Repeating it changes nothing. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_volunteers.deactivate_volunteer(self.session_factory, self._actor(), volunteer_id)

    async def reactivate_volunteer(self, volunteer_id: str) -> dict:
        """Undo ``deactivate_volunteer``: the person counts as an active volunteer again (add a new help period; closed ones are not reopened). Repeating it changes nothing. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_volunteers.reactivate_volunteer(self.session_factory, self._actor(), volunteer_id)
