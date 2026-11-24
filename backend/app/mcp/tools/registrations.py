"""Admin tools for registrations, check-in and payment transactions.

See ``app.mcp.admin`` and the tier modules for the implementations; ``app.mcp.server`` registers these."""

from __future__ import annotations

from app.mcp.admin import payments as mcp_admin_payments
from app.mcp.admin import registrations as mcp_admin_registrations
from app.mcp.tools.base import McpBackendBase


class RegistrationsTools(McpBackendBase):
    """Admin tools for registrations, check-in and payment transactions."""

    async def list_registrations(
        self,
        edition_id: str | None = None,
        event_id: str | None = None,
        status: str | None = None,
        payment_status: str | None = None,
        checked_in: bool | None = None,
        q: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> dict:
        """List registrations (newest first), with optional filters. Requires the ``admin`` role.

        Enumerates registrations without needing to already know a
        ``registration_id`` — pair with ``get_guest_registration`` for full
        detail (order items, notes) on a specific result. ``q`` matches
        against the registrant's name/email, same as ``find_guest``. ``limit``
        defaults to 50 and is capped at 200.
        """
        role = self._require_admin()
        return await mcp_admin_registrations.list_registrations(
            self.session_factory,
            role,
            edition_id=edition_id,
            event_id=event_id,
            status=status,
            payment_status=payment_status,
            checked_in=checked_in,
            q=q,
            limit=limit,
            offset=offset,
        )

    async def create_registration(
        self,
        person_id: str,
        event_id: str,
        guest_count: int,
        order_items: list[dict] | None = None,
        order_answers: list[dict] | None = None,
        notes: str = "",
        accessibility_note: str = "",
        status: str = "confirmed",
    ) -> dict:
        """Create a registration on a guest's behalf. Requires the ``admin`` role.

        ``order_items`` is a list of ``{"product_id": ..., "quantity": ...}``; quantities
        are resolved against the event's real active products server-side.
        """
        self._require_admin()
        return await mcp_admin_registrations.create_registration(
            self.session_factory,
            self._actor(),
            person_id=person_id,
            event_id=event_id,
            guest_count=guest_count,
            order_items=order_items,
            order_answers=order_answers,
            notes=notes,
            accessibility_note=accessibility_note,
            status=status,
        )

    async def check_in(self, registration_id: str, issue_strap: bool = True) -> dict:
        """Check in a registration and stamp capsule-exchange attendance. Requires admin."""
        self._require_admin()
        return await mcp_admin_registrations.update_registration(
            self.session_factory,
            self._actor(),
            registration_id,
            checked_in=True,
            strap_issued=True if issue_strap else None,
        )

    async def update_registration(
        self,
        registration_id: str,
        guest_count: int | None = None,
        status: str | None = None,
        amount_due: float | None = None,
        clear_amount_due: bool = False,
        allocations: list[dict] | None = None,
        confirm_over_capacity: bool = False,
        order_items: list[dict] | None = None,
        order_answers: list[dict] | None = None,
        notes: str | None = None,
        accessibility_note: str | None = None,
        person_id: str | None = None,
        checked_in: bool | None = None,
        strap_issued: bool | None = None,
    ) -> dict:
        """Partially update a registration; omitted fields are left unchanged.

        ``amount_due`` has no natural "clear" value via a plain optional
        parameter (0.0 is a valid amount_due) — pass ``clear_amount_due=True``
        to null it out. ``order_items`` takes ``product_id``/``quantity`` pairs;
        product details are resolved server-side. ``allocations`` replaces the
        complete table allocation list. ``payment_status``/paid total are
        ledger-derived (#1019) — use ``create_payment_transaction`` to record
        a payment or refund instead. Requires the ``admin`` role.
        """
        self._require_admin()
        return await mcp_admin_registrations.update_registration(
            self.session_factory,
            self._actor(),
            registration_id,
            guest_count=guest_count,
            status=status,
            amount_due=amount_due,
            clear_amount_due=clear_amount_due,
            allocations=allocations,
            confirm_over_capacity=confirm_over_capacity,
            order_items=order_items,
            order_answers=order_answers,
            notes=notes,
            accessibility_note=accessibility_note,
            person_id=person_id,
            checked_in=checked_in,
            strap_issued=strap_issued,
        )

    async def delete_registration(self, registration_id: str) -> dict:
        """Delete a registration. Requires the ``admin`` role."""
        self._require_admin()
        return await mcp_admin_registrations.delete_registration(self.session_factory, self._actor(), registration_id)

    async def create_payment_transaction(
        self,
        registration_id: str,
        amount: float,
        effective_date: str,
        reference: str | None = None,
        note: str | None = None,
        reversed_transaction_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        """Append one payment-ledger entry against a booking. Requires the ``admin`` role.

        There's no ``kind``: a positive ``amount`` is a payment, a negative
        one is a refund. Never edits or deletes a prior entry — a refund is
        always a new, separate row, optionally linked via
        ``reversed_transaction_id`` to the entry it reverses. Pass the same
        ``idempotency_key`` on a retry (e.g. after a timeout) to safely
        replay the same result instead of recording the money twice — see
        docs/retry-safety.md.
        """
        self._require_admin()
        return await mcp_admin_payments.create_payment_transaction(
            self.session_factory,
            self._actor(),
            registration_id,
            amount=amount,
            effective_date=effective_date,
            reference=reference,
            note=note,
            reversed_transaction_id=reversed_transaction_id,
            idempotency_key=idempotency_key,
        )

    async def list_payment_transactions(self, registration_id: str) -> dict:
        """List one booking's chronological payment ledger. Requires the ``admin`` role.

        The accounting source of truth behind that booking's
        ``amount_paid``/``payment_status``/``refund_due`` fields.
        """
        self._require_admin()
        return await mcp_admin_payments.list_payment_transactions(self.session_factory, registration_id)
