"""Markdown rendering and HTML sanitization shared by policy preview and public output.

A single render path (`render_markdown`) is used everywhere policy content becomes
HTML — the admin preview endpoint and the public policy endpoint both call it, so
there is exactly one renderer/sanitizer pair rather than two implementations that
could drift apart (see #944's "exact same renderer/sanitizer for preview and public
output" requirement).
"""

from __future__ import annotations

import nh3
from markdown_it import MarkdownIt

# Explicit subset: headings (h2/h3 only — h1 is reserved for the page title),
# paragraphs, emphasis, links, lists, blockquotes, and code. No raw HTML, no
# images, no tables. `html: False` means markdown-it escapes any raw HTML/script
# tags an author types rather than passing them through; `linkify: False` avoids
# auto-detecting bare text as links. Image syntax is disabled so `![x](url)`
# degrades to a plain link rather than an <img> tag.
_renderer = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False})
_renderer.disable(["image"])

_ALLOWED_TAGS = {"p", "strong", "em", "a", "ul", "ol", "li", "blockquote", "code", "pre", "h2", "h3", "hr", "br"}
_ALLOWED_ATTRIBUTES = {"a": {"href"}}
_ALLOWED_URL_SCHEMES = {"http", "https", "mailto"}


def render_markdown(source: str | None) -> str:
    """Render Markdown source to sanitized HTML using the fixed allowlist above."""
    if not source:
        return ""
    raw_html = _renderer.render(source)
    return nh3.clean(
        raw_html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        url_schemes=_ALLOWED_URL_SCHEMES,
        link_rel="noopener noreferrer nofollow",
    )
