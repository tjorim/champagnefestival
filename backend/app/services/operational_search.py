"""Shared matching policy for authenticated operational lookup."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Literal

from sqlalchemy import and_, case, false, func, literal, or_

from app.models import Person

DEFAULT_RESULT_LIMIT = 20
MAX_RESULT_LIMIT = 50
NAME_FUZZY_THRESHOLD = 0.72
EMAIL_FUZZY_THRESHOLD = 0.88
EMAIL_FUZZY_MIN_LENGTH = 6
EMAIL_FUZZY_MAX_EDIT_DISTANCE = 2

MatchKind = Literal["exact", "substring", "fuzzy"]
MatchField = Literal["name", "email", "table", "registration_id", "event", "order"]


@dataclass(frozen=True, order=True)
class RankedMatch:
    """A comparable match score. Lower sort keys rank first."""

    rank: int
    distance: float
    field: MatchField
    kind: MatchKind


def bounded_limit(limit: int) -> int:
    return min(max(limit, 1), MAX_RESULT_LIMIT)


def _contains_pattern(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"


def person_search_predicate(*, name: str | None, email: str | None) -> Any:
    """Build the PostgreSQL-backed authorized person lookup predicate."""

    filters = []
    if name and (normalized_name := normalize_text(name)):
        pattern = _contains_pattern(normalized_name)
        filters.extend(
            [
                Person.search_name == normalized_name,
                Person.search_name_alt == normalized_name,
                Person.search_name.ilike(pattern, escape="\\"),
                Person.search_name_alt.ilike(pattern, escape="\\"),
                func.word_similarity(normalized_name, Person.search_name) >= NAME_FUZZY_THRESHOLD,
                func.word_similarity(normalized_name, Person.search_name_alt) >= NAME_FUZZY_THRESHOLD,
            ]
        )
    if email and (normalized_email := normalize_email(email)):
        filters.append(Person.search_email == normalized_email)
        filters.append(Person.search_email.ilike(_contains_pattern(normalized_email), escape="\\"))
        if len(normalized_email) >= EMAIL_FUZZY_MIN_LENGTH:
            filters.append(
                and_(
                    func.abs(func.length(Person.search_email) - len(normalized_email)) <= EMAIL_FUZZY_MAX_EDIT_DISTANCE,
                    func.levenshtein_less_equal(
                        normalized_email,
                        Person.search_email,
                        EMAIL_FUZZY_MAX_EDIT_DISTANCE,
                    )
                    <= EMAIL_FUZZY_MAX_EDIT_DISTANCE,
                )
            )
    if not filters:
        return false()
    return or_(*filters)


def person_search_order_by(*, name: str | None, email: str | None) -> tuple[Any, ...]:
    """Order exact and substring person matches ahead of fuzzy suggestions."""

    normalized_name = normalize_text(name) if name else ""
    normalized_email = normalize_email(email) if email else ""
    exact = []
    substring = []
    similarities = []
    if normalized_name:
        exact.extend([Person.search_name == normalized_name, Person.search_name_alt == normalized_name])
        pattern = _contains_pattern(normalized_name)
        substring.extend(
            [
                Person.search_name.ilike(pattern, escape="\\"),
                Person.search_name_alt.ilike(pattern, escape="\\"),
            ]
        )
        similarities.extend(
            [
                func.word_similarity(normalized_name, Person.search_name),
                func.word_similarity(normalized_name, Person.search_name_alt),
            ]
        )
    if normalized_email:
        exact.append(Person.search_email == normalized_email)
        substring.append(Person.search_email.ilike(_contains_pattern(normalized_email), escape="\\"))
        similarities.append(func.similarity(normalized_email, Person.search_email))
    if not similarities:
        return (Person.name, Person.id)
    email_distance = (
        func.levenshtein_less_equal(normalized_email, Person.search_email, EMAIL_FUZZY_MAX_EDIT_DISTANCE)
        if normalized_email and not normalized_name
        else literal(0)
    )
    similarity = similarities[0] if len(similarities) == 1 else func.greatest(*similarities)
    return (
        case((or_(*exact), 0), (or_(*substring) if substring else false(), 1), else_=2),
        email_distance,
        similarity.desc(),
        Person.name,
        Person.id,
    )


def normalize_text(value: str) -> str:
    """Normalize human-facing text for deterministic comparisons."""

    folded = (
        value.strip()
        .casefold()
        .replace("œ", "oe")
        .replace("æ", "ae")
        .replace("ø", "o")
        .replace("ł", "l")
        .replace("đ", "d")
    )
    decomposed = unicodedata.normalize("NFKD", folded)
    ascii_text = "".join(character for character in decomposed if not unicodedata.combining(character))
    return " ".join(re.sub(r"[^\w]+", " ", ascii_text).split())


def name_variants(value: str) -> set[str]:
    """Return accent-insensitive variants plus common German transliterations."""

    folded = value.strip().casefold()
    german = folded.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    plain = folded.replace("ß", "ss")
    return {normalize_text(plain), normalize_text(german)}


def normalize_email(value: str) -> str:
    return value.strip().casefold()


def normalize_table_reference(value: str) -> str:
    """Normalize visible table labels without typo-based matching."""

    normalized = normalize_text(value)
    return re.sub(r"^(?:table|tafel|tableau)\s+", "", normalized).strip()


def _ratio(left: str, right: str) -> float:
    return SequenceMatcher(None, left, right).ratio()


def _best_ratio(left_variants: set[str], right_variants: set[str]) -> float:
    return max((_ratio(left, right) for left in left_variants for right in right_variants), default=0.0)


def rank_name(query: str, candidate: str) -> RankedMatch | None:
    query_variants = name_variants(query)
    candidate_variants = name_variants(candidate)
    if not any(query_variants) or not any(candidate_variants):
        return None
    if query_variants & candidate_variants:
        return RankedMatch(0, 0.0, "name", "exact")
    if any(q_var in c_var or c_var in q_var for q_var in query_variants for c_var in candidate_variants):
        return RankedMatch(10, 0.0, "name", "substring")
    similarity = _best_ratio(query_variants, candidate_variants)
    if similarity >= NAME_FUZZY_THRESHOLD:
        return RankedMatch(20, 1.0 - similarity, "name", "fuzzy")
    candidate_words = {word for c in candidate_variants for word in c.split() if len(word) >= 3}
    word_similarity = max((_ratio(q, word) for q in query_variants for word in candidate_words), default=0.0)
    if word_similarity >= NAME_FUZZY_THRESHOLD:
        return RankedMatch(20, 1.0 - word_similarity, "name", "fuzzy")
    return None


def rank_email(query: str, candidate: str) -> RankedMatch | None:
    normalized_query = normalize_email(query)
    normalized_candidate = normalize_email(candidate)
    if normalized_query == normalized_candidate:
        return RankedMatch(0, 0.0, "email", "exact")
    if len(normalized_query) < EMAIL_FUZZY_MIN_LENGTH:
        return None
    if abs(len(normalized_query) - len(normalized_candidate)) > EMAIL_FUZZY_MAX_EDIT_DISTANCE:
        return None
    similarity = _ratio(normalized_query, normalized_candidate)
    if similarity >= EMAIL_FUZZY_THRESHOLD:
        return RankedMatch(30, 1.0 - similarity, "email", "fuzzy")
    return None


def rank_table_reference(query: str, *, table_id: str, table_name: str) -> RankedMatch | None:
    normalized_query = normalize_table_reference(query)
    if not normalized_query:
        return None
    if normalized_query.isdigit():
        for candidate in (table_id, table_name):
            normalized_candidate = normalize_table_reference(candidate)
            if normalized_candidate == normalized_query or normalized_query in normalized_candidate.split():
                return RankedMatch(0, 0.0, "table", "exact")
        return None
    for candidate in (table_id, table_name):
        normalized_candidate = normalize_table_reference(candidate)
        if normalized_query == normalized_candidate:
            return RankedMatch(0, 0.0, "table", "exact")
        if normalized_query in normalized_candidate:
            return RankedMatch(10, 0.0, "table", "substring")
    return None


def rank_identifier(query: str, candidate: str, field: Literal["registration_id", "event"]) -> RankedMatch | None:
    normalized_query = normalize_text(query)
    normalized_candidate = normalize_text(candidate)
    if normalized_query == normalized_candidate:
        return RankedMatch(0, 0.0, field, "exact")
    if normalized_query and normalized_query in normalized_candidate:
        return RankedMatch(10, 0.0, field, "substring")
    return None


def rank_order_text(query: str, *, product_name: str, category: str) -> RankedMatch | None:
    normalized_query = normalize_text(query)
    if not normalized_query:
        return None
    for candidate in (product_name, category):
        normalized_candidate = normalize_text(candidate)
        if normalized_query == normalized_candidate:
            return RankedMatch(0, 0.0, "order", "exact")
        if normalized_query in normalized_candidate:
            return RankedMatch(10, 0.0, "order", "substring")
    return None


def best_registration_match(
    query: str,
    *,
    person_name: str,
    person_email: str,
    registration_id: str,
    event_id: str,
    event_title: str,
    table_id: str | None,
    table_name: str | None,
    pre_orders: list[dict] | None,
) -> RankedMatch | None:
    """Rank an operational query across supported registration fields."""

    matches = [
        rank_name(query, person_name),
        rank_email(query, person_email),
        rank_identifier(query, registration_id, "registration_id"),
        rank_identifier(query, event_id, "event"),
        rank_identifier(query, event_title, "event"),
        (
            rank_table_reference(query, table_id=table_id or "", table_name=table_name or "")
            if table_id is not None or table_name
            else None
        ),
    ]
    matches.extend(
        rank_order_text(
            query,
            product_name=str(item.get("name", "")),
            category=str(item.get("category", "")),
        )
        for item in (pre_orders or [])
        if isinstance(item, dict)
    )
    return min((match for match in matches if match is not None), default=None)


def matches_order_filters(
    pre_orders: list[dict] | None,
    *,
    category: str | None,
    delivery_state: Literal["pending", "delivered"] | None,
) -> bool:
    """Match deterministic order filters without fuzzy numeric behavior."""

    if category is None and delivery_state is None:
        return True
    for item in pre_orders or []:
        if not isinstance(item, dict):
            continue
        if category is not None and normalize_text(str(item.get("category", ""))) != normalize_text(category):
            continue
        try:
            quantity = max(int(item.get("quantity", 0) or 0), 0)
        except (TypeError, ValueError):
            quantity = 0
        delivered_quantity = item.get("delivered_quantity")
        if delivered_quantity is None:
            delivered_quantity = quantity if item.get("delivered", False) else 0
        try:
            delivered_quantity = max(min(int(delivered_quantity or 0), quantity), 0)
        except (TypeError, ValueError):
            delivered_quantity = 0
        if delivery_state == "pending" and delivered_quantity >= quantity:
            continue
        if delivery_state == "delivered" and delivered_quantity < quantity:
            continue
        return True
    return False


def best_person_match(
    *, name: str | None, email: str | None, candidate_name: str, candidate_email: str
) -> RankedMatch | None:
    matches = [
        match
        for match in (
            rank_name(name, candidate_name) if name else None,
            rank_email(email, candidate_email) if email else None,
        )
        if match is not None
    ]
    return min(matches, default=None)
