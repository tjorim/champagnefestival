"""Marker replacement into the built frontend shell for `/` and `/privacy` (#992).

The shell (`index.html`
as built by Vite) stays owned by the frontend; this module only fills
reserved slots (``<!--ssr:head-->``, ``<!--ssr:content-->``) and rewrites a
handful of existing static meta tags (title, description, og:*, twitter:*,
canonical, `<html lang>`) so a crawler never sees two conflicting values.

Every interpolated value goes through ``_text``/``_attr`` below, which
escape by default — no call site hand-concatenates HTML. This matters
because FAQ answers and event titles/descriptions are admin-authored free
text, not developer-controlled strings.
"""

from __future__ import annotations

import html
import json
import re
from collections.abc import Mapping

from app.services.frontend_i18n_snippets import FAQ_TITLE, SCHEDULE_TITLE, Locale


def _text(value: str) -> str:
    """Escape *value* for use as HTML element content."""
    return html.escape(value, quote=False)


def _attr(value: str) -> str:
    """Escape *value* for use inside a double-quoted HTML attribute."""
    return html.escape(value, quote=True)


def json_ld_script(data: Mapping) -> str:
    """A `<script type="application/ld+json">` block safe against a
    `</script>` sequence in any string field, marked so the client
    component (JsonLd.tsx) can detect it and not render a duplicate."""
    payload = json.dumps(dict(data), separators=(",", ":")).replace("<", "\\u003c")
    return f'<script type="application/ld+json" data-ssr-jsonld="true">{payload}</script>'


def _rewrite_title(shell_html: str, title: str) -> str:
    return re.sub(r"(<title>)[^<]*(</title>)", lambda m: m.group(1) + _text(title) + m.group(2), shell_html, count=1)


def _rewrite_meta_content(shell_html: str, *, attr: str, value: str, content: str) -> str:
    pattern = re.compile(rf'(<meta\s+{attr}="{re.escape(value)}"\s+content=")[^"]*("\s*/?>)')
    return pattern.sub(lambda m: m.group(1) + _attr(content) + m.group(2), shell_html, count=1)


def _rewrite_link_href(shell_html: str, *, rel: str, href: str) -> str:
    pattern = re.compile(rf'(<link\s+rel="{re.escape(rel)}"\s+href=")[^"]*("\s*/?>)')
    return pattern.sub(lambda m: m.group(1) + _attr(href) + m.group(2), shell_html, count=1)


def _rewrite_html_lang(shell_html: str, lang: str) -> str:
    return re.sub(r'(<html\s+lang=")[^"]*(")', lambda m: m.group(1) + _attr(lang) + m.group(2), shell_html, count=1)


def rewrite_head_meta(shell_html: str, *, title: str, description: str, url: str, locale: Locale) -> str:
    """Rewrite the shell's static title/description/og:*/twitter:*/canonical/lang
    in place — see module docstring. Each substitution is `count=1` and
    matched by attribute name/value, not by the placeholder text Vite already
    replaced at build time (this process only ever sees the built output)."""
    html_out = _rewrite_title(shell_html, title)
    html_out = _rewrite_meta_content(html_out, attr="name", value="title", content=title)
    html_out = _rewrite_meta_content(html_out, attr="name", value="description", content=description)
    html_out = _rewrite_meta_content(html_out, attr="property", value="og:url", content=url)
    html_out = _rewrite_meta_content(html_out, attr="property", value="og:title", content=title)
    html_out = _rewrite_meta_content(html_out, attr="property", value="og:description", content=description)
    html_out = _rewrite_meta_content(html_out, attr="name", value="twitter:url", content=url)
    html_out = _rewrite_meta_content(html_out, attr="name", value="twitter:title", content=title)
    html_out = _rewrite_meta_content(html_out, attr="name", value="twitter:description", content=description)
    html_out = _rewrite_link_href(html_out, rel="canonical", href=url)
    html_out = _rewrite_html_lang(html_out, locale)
    return html_out


def inject_marker(shell_html: str, marker: str, fragment: str) -> str:
    """Replace one `<!--marker-->` comment with *fragment* — inert in every
    other serving path (pnpm dev, any route the backend doesn't render)."""
    return shell_html.replace(f"<!--{marker}-->", fragment, 1)


def render_faq_section(faq_items: list[dict], *, locale: Locale) -> str:
    if not faq_items:
        return ""
    items_html = "".join(
        f"<details><summary>{_text(item['question'])}</summary><p>{_text(item['answer'])}</p></details>"
        for item in faq_items
    )
    return f"<section><h2>{_text(FAQ_TITLE[locale])}</h2>{items_html}</section>"


def render_schedule_section(events: list[dict], *, locale: Locale) -> str:
    if not events:
        return ""
    items_html = "".join(f"<li>{_text(event['title'])} — {_text(str(event['date']))}</li>" for event in events)
    return f"<section><h2>{_text(SCHEDULE_TITLE[locale])}</h2><ul>{items_html}</ul></section>"


def render_home_content(*, faq_items: list[dict], events: list[dict], locale: Locale) -> str:
    """Fragment for `/`'s `<!--ssr:content-->` slot: crawler-visible FAQ and
    schedule text, styled with the Bootstrap classes the page already loads.
    Replaced wholesale when React mounts (`createRoot`, not `hydrateRoot` —
    see decision 4: no hydration-mismatch failure mode to design around, so
    this doesn't try to pixel-match the client render). The JSON-LD script
    is a separate fragment (`json_ld_script`) injected into `<!--ssr:head-->`
    instead — see `app.routers.public_pages`."""
    return (
        '<div class="container py-5">'
        + render_schedule_section(events, locale=locale)
        + render_faq_section(faq_items, locale=locale)
        + "</div>"
    )


def render_privacy_content(*, title: str, html_body: str) -> str:
    """Fragment for `/privacy`'s `<!--ssr:content-->` slot. *html_body* is
    already-sanitized output from ``app.services.policy_markdown.render_markdown``
    — the single renderer/sanitizer pair #944 established, reused rather than
    a second one (see decision 1's "Escaping is the part worth being
    deliberate about" section)."""
    return f'<div class="container py-5"><h1>{_text(title)}</h1>{html_body}</div>'


__all__ = [
    "inject_marker",
    "json_ld_script",
    "render_faq_section",
    "render_home_content",
    "render_privacy_content",
    "render_schedule_section",
    "rewrite_head_meta",
]
