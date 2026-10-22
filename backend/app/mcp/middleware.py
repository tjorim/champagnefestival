"""Server-wide tool-call failure handling for the MCP surface.

Without this, a failed call reaches the agent as one of three unhelpful shapes:

* an unknown/hidden tool via the ``call_tool`` proxy is masked to
  ``Error calling tool 'call_tool'`` — indistinguishable from a crash;
* bad arguments surface FastMCP's raw validation text (JSON-RPC ``-32602``),
  which embeds the offending input values;
* any unexpected exception is masked to a bare message with nothing to quote
  when someone asks the operator "what happened?";
* a Pydantic error raised by a tool's *body* (a stored row or generated result
  that no longer fits its model) is logged by FastMCP, with the offending
  values, before any middleware runs.

:class:`ToolFailureMiddleware` turns each into a tool error the agent can act
on. Domain errors (:class:`~app.mcp.utils.MCPToolError`) are already sanitized
and pass through untouched. The last case is closed at the tool itself, by
:func:`without_body_validation_payload`, because it is the only place that runs
before FastMCP sees the raw error.
"""

from __future__ import annotations

import functools
import inspect
import logging
import uuid
from collections.abc import Callable
from typing import Any

import mcp.types as mt
from fastmcp.exceptions import DisabledError, NotFoundError, ToolError
from fastmcp.exceptions import ValidationError as FastMCPValidationError
from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext
from fastmcp.tools.base import ToolResult
from mcp import MCPError
from pydantic import ValidationError as PydanticValidationError

from app.mcp.utils import MCPToolError

logger = logging.getLogger(__name__)

_MAX_FIELD_ERRORS = 5


class CorrelatedToolError(ToolError):
    """A tool error this middleware already translated.

    A distinct type so the nested ``call_tool`` proxy -> real tool dispatch,
    which runs the middleware twice, never translates (and re-numbers) the same
    failure a second time.
    """


class ToolResultValidationError(ToolError):
    """Pydantic rejected data a tool body built or loaded — not the caller's arguments.

    FastMCP validates arguments before the body runs, so this is a server-side
    problem (a stored row or generated result that no longer fits its model).
    Carries only field paths and Pydantic error types: ``str()`` of the original
    error embeds the rejected input, which may be guest PII.
    """

    def __init__(self, error: PydanticValidationError) -> None:
        self.fields = _field_errors(error)
        super().__init__("Tool produced invalid data")


def without_body_validation_payload[F: Callable[..., Any]](fn: F) -> F:
    """Wrap an async tool so a Pydantic error from its body never carries input values.

    FastMCP 4.1 wraps such an error (message included) and logs it with its
    traceback before outer middleware runs, so the values would reach the server
    log; sanitize here, where the raw error is still ours. Argument failures are
    raised before the body and are unaffected, which keeps the two distinguishable.
    """
    if not inspect.iscoroutinefunction(fn):
        raise TypeError(f"{getattr(fn, '__name__', fn)!r} must be an async function")

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await fn(*args, **kwargs)
        except PydanticValidationError as exc:
            raise ToolResultValidationError(exc) from None

    return wrapper  # ty: ignore[invalid-return-type]


def _new_request_id() -> str:
    return uuid.uuid4().hex[:12]


def _field_errors(exc: PydanticValidationError) -> list[tuple[str, str]]:
    """``(field path, pydantic error type)`` per failing field — never input values."""
    return [
        (".".join(str(part) for part in err["loc"]) or "arguments", err["type"])
        for err in exc.errors(include_url=False, include_context=False, include_input=False)
    ]


def _field_messages(exc: PydanticValidationError) -> list[str]:
    """``path: message`` per failing field.

    Pydantic's own messages ("Field required", "Input should be a valid
    string") describe the constraint, not the value. ``include_input=False``
    keeps the rejected payload out of both this and the log.
    """
    return [
        f"{'.'.join(str(part) for part in err['loc']) or 'arguments'}: {err['msg']}"
        for err in exc.errors(include_url=False, include_context=False, include_input=False)
    ]


class ToolFailureMiddleware(Middleware):
    """Translate tool-call failures into correlated, agent-actionable tool errors.

    Parameters
    ----------
    search_tool_name, call_tool_name:
        Names of the synthetic search/proxy tools, as configured on the
        ``BM25SearchTransform``. The proxy's ``name`` argument is the tool the
        agent really means, so errors are reported against that name.
    """

    def __init__(self, *, search_tool_name: str = "search_tools", call_tool_name: str = "call_tool") -> None:
        self._search_tool_name = search_tool_name
        self._call_tool_name = call_tool_name

    def _proxied_name(self, tool_name: str, arguments: dict[str, Any] | None) -> str | None:
        """The tool the agent asked the ``call_tool`` proxy to run, if this is a proxy call."""
        if tool_name == self._call_tool_name and arguments:
            proxied = arguments.get("name")
            if isinstance(proxied, str) and proxied:
                return proxied
        return None

    def _unknown_tool(self, target: str, request_id: str) -> CorrelatedToolError:
        logger.warning("MCP call to unknown or unavailable tool %r (request %s)", target, request_id)
        return CorrelatedToolError(
            f"Unknown tool {target!r}. Use {self._search_tool_name} to find a tool for your task, "
            f"then run it with {self._call_tool_name}. Only tools your role may use are listed. "
            f"(request id {request_id})",
            log_level=logging.WARNING,
        )

    async def on_call_tool(
        self,
        context: MiddlewareContext[mt.CallToolRequestParams],
        call_next: CallNext[mt.CallToolRequestParams, ToolResult],
    ) -> ToolResult:
        tool_name = context.message.name
        arguments = context.message.arguments
        proxied = self._proxied_name(tool_name, arguments)
        # Report failures against the tool the agent really means, not the proxy.
        target = proxied or tool_name

        # The proxy refuses its own synthetic tools with a ValueError that the
        # dispatcher would otherwise mask; say what is actually wrong instead.
        if proxied in {self._call_tool_name, self._search_tool_name}:
            request_id = _new_request_id()
            logger.warning("MCP call_tool proxy asked to run synthetic tool %r (request %s)", target, request_id)
            raise CorrelatedToolError(
                f"{target!r} cannot be run through {self._call_tool_name}. Call {self._search_tool_name} "
                f"directly to discover tools, then pass the tool it returns to {self._call_tool_name}. "
                f"(request id {request_id})",
                log_level=logging.WARNING,
            )

        try:
            return await call_next(context)
        except CorrelatedToolError, MCPToolError:
            # Already actionable and sanitized (our own, or a domain error).
            raise
        except MCPError:
            # Protocol-level signals (e.g. a missing client capability) must
            # keep their JSON-RPC code; flattening them hides the real problem.
            raise
        except (NotFoundError, DisabledError) as exc:
            raise self._unknown_tool(target, _new_request_id()) from exc
        except ToolResultValidationError as exc:
            request_id = _new_request_id()
            fields = "; ".join(f"{path} [{kind}]" for path, kind in exc.fields[:_MAX_FIELD_ERRORS])
            if len(exc.fields) > _MAX_FIELD_ERRORS:
                fields += f"; and {len(exc.fields) - _MAX_FIELD_ERRORS} more"
            # The traceback shows where, the fields show what; neither holds a value.
            logger.error("MCP tool %r produced invalid data (request %s): %s", target, request_id, fields, exc_info=exc)
            raise CorrelatedToolError(
                f"Tool {target!r} produced invalid data ({fields}). Your arguments were accepted; "
                f"the problem is in stored or generated data. Quote request id {request_id} to the operator."
            ) from exc
        except FastMCPValidationError as exc:
            request_id = _new_request_id()
            cause = exc.__cause__
            if isinstance(cause, PydanticValidationError):
                errors = _field_errors(cause)
                # Field paths and error types only: the rejected values may be
                # guest PII and never belong in a log line.
                logger.warning(
                    "MCP tool %r rejected arguments (request %s): %s",
                    target,
                    request_id,
                    "; ".join(f"{path} [{kind}]" for path, kind in errors[:_MAX_FIELD_ERRORS]),
                )
                messages = _field_messages(cause)
                detail = "; ".join(messages[:_MAX_FIELD_ERRORS])
                if len(messages) > _MAX_FIELD_ERRORS:
                    detail += f"; and {len(messages) - _MAX_FIELD_ERRORS} more"
                raise CorrelatedToolError(
                    f"Invalid arguments for {target!r}: {detail}. "
                    f"Check the tool's input_schema from search_tools. (request id {request_id})",
                    log_level=logging.WARNING,
                ) from exc
            logger.warning("MCP tool %r rejected arguments (request %s)", target, request_id)
            raise CorrelatedToolError(
                f"Invalid arguments for {target!r}. Check the tool's input_schema from "
                f"{self._search_tool_name}. (request id {request_id})",
                log_level=logging.WARNING,
            ) from exc
        except ToolError as exc:
            cause = exc.__cause__
            if type(exc) is ToolError and cause is not None and str(exc) == f"Error calling tool {tool_name!r}":
                # FastMCP's masked wrapper (mask_error_details=True): the real
                # failure is the cause. Anything else — a rate-limit or timeout
                # notice FastMCP deliberately words for the agent — passes through.
                if isinstance(cause, (NotFoundError, DisabledError)):
                    raise self._unknown_tool(target, _new_request_id()) from exc
                request_id = _new_request_id()
                logger.error(
                    "MCP tool %r failed unexpectedly (request %s): %s",
                    target,
                    request_id,
                    type(cause).__name__,
                    exc_info=cause,
                )
                raise CorrelatedToolError(
                    f"Tool {target!r} failed unexpectedly ({type(cause).__name__}). "
                    f"Nothing more can be shown here; quote request id {request_id} to the operator."
                ) from exc
            raise
        except Exception as exc:
            request_id = _new_request_id()
            logger.error(
                "MCP tool %r failed unexpectedly (request %s): %s",
                target,
                request_id,
                type(exc).__name__,
                exc_info=exc,
            )
            raise CorrelatedToolError(
                f"Tool {target!r} failed unexpectedly ({type(exc).__name__}). "
                f"Nothing more can be shown here; quote request id {request_id} to the operator."
            ) from exc
