"""Admin (write) MCP tool implementations, one module per REST router.

Each module exposes plain async functions shaped ``(session_factory, actor,
*, ...fields) -> dict``, mirroring the corresponding router in
``app.routers`` closely enough that the two stay easy to compare, and
writing to the same ``AuditEntry`` trail via ``write_audit_entry`` so the
audit log is complete regardless of which surface made the change.

Convention for partial updates (mirrors the REST ``*Update`` schemas):
- omitting a keyword argument (leaving it at its ``None`` default) means
  "leave unchanged", matching the REST layer's own ``is not None`` checks;
- for string fields where the REST layer treats an explicit empty string as
  "clear this optional field", the MCP tool does the same;
- for nullable foreign-key fields with no natural "empty" sentinel (an int
  id, or a string id where blank isn't a valid clear signal), a sibling
  ``clear_<field>: bool = False`` parameter exists to unset it.

Domain errors (not found, conflict, invalid input) are raised as plain
``ValueError`` — there is no HTTP response to hang a status code off, and
FastMCP surfaces the exception message to the calling agent either way.

Shared-service extraction (issue #807)
---------------------------------------
Validation, locking, cascade guards, and audit-detail construction are being
moved out of this package and its ``app.routers`` counterpart into
``app/services/<domain>_service.py`` modules, so both surfaces call the same
code instead of maintaining parallel copies (see ``app/services/errors.py``
for the shared exception convention). Both this module and its REST router
become thin adapters around the service.

Migrated so far: ``layouts``, ``tables``, ``areas``, ``venues``, ``rooms``,
``table_types``.

Not yet migrated (still duplicated between this package and
``app.routers``): ``editions``, ``events``, ``exhibitors``, ``faq``,
``members``, ``people``, ``registrations``, ``settings``, ``volunteers``.
``audit`` is read-only and has no mutation logic to share. Follow the pattern
in ``app/services/layouts_service.py`` (the most complex migrated domain) or
``app/services/venues_service.py`` (a simpler CRUD-with-cascade-guard
example) when migrating the rest.
"""

from __future__ import annotations
