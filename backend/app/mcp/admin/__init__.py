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
"""

from __future__ import annotations
