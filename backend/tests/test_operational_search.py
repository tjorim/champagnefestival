"""Focused tests for the shared authenticated operational matching policy."""

from sqlalchemy.dialects import postgresql

from app.operational_search_schema import OPERATIONAL_SEARCH_SCHEMA_STATEMENTS
from app.services.operational_search import (
    best_registration_match,
    bounded_limit,
    name_variants,
    person_search_predicate,
    rank_email,
    rank_name,
    rank_table_reference,
)


def test_names_are_accent_insensitive_for_french_and_dutch_names():
    assert rank_name("Francois", "François") is not None
    assert rank_name("Vandervaeren", "Vandervåren") is not None


def test_name_typo_is_lower_ranked_than_normalized_exact_match():
    exact = rank_name("Schmidt", "Schmidt")
    typo = rank_name("Schmitt", "Schmidt")
    assert exact is not None
    assert typo is not None
    assert exact < typo
    assert typo.kind == "fuzzy"


def test_german_transliteration_variants_are_supported():
    assert "mueller" in name_variants("Müller")
    assert rank_name("Mueller", "Müller") is not None
    assert rank_name("Gross", "Groß") is not None


def test_email_matching_is_exact_first_and_rejects_short_fuzzy_queries():
    exact = rank_email("guest@example.com", "GUEST@example.com")
    typo = rank_email("guest@gamil.com", "guest@gmail.com")
    assert exact is not None
    assert typo is not None
    assert exact < typo
    assert typo.kind == "fuzzy"
    assert rank_email("a@b.c", "a@c.c") is None
    assert rank_email("nobody@example.com", "guest@gmail.com") is None


def test_table_reference_normalization_never_fuzzy_matches_nearby_number():
    assert rank_table_reference("Table 12", table_id="tbl-12", table_name="table-12") is not None
    assert rank_table_reference("12", table_id="tbl-12", table_name="Table 12") is not None
    assert rank_table_reference("12", table_id="tbl-21", table_name="Table 21") is None
    assert rank_table_reference("12", table_id="tbl-312", table_name="Table 312") is None


def test_registration_lookup_supports_order_product_without_fuzzy_identifiers():
    match = best_registration_match(
        "Brut Reserve",
        person_name="Jane Doe",
        person_email="jane@example.com",
        registration_id="reg-1",
        event_id="event-1",
        event_title="Friday tasting",
        table_id="tbl-12",
        table_name="Table 12",
        pre_orders=[{"name": "Brut Réserve", "category": "champagne"}],
    )
    assert match is not None
    assert match.field == "order"
    assert match.kind == "exact"


def test_person_search_predicate_uses_postgresql_name_and_email_matching():
    predicate = person_search_predicate(name="Francois", email="guest@gamil.com")
    sql = str(predicate.compile(dialect=postgresql.dialect()))
    assert "word_similarity" in sql
    assert "levenshtein_less_equal" in sql


def test_operational_limits_are_bounded():
    assert bounded_limit(0) == 1
    assert bounded_limit(20) == 20
    assert bounded_limit(1000) == 50


def test_operational_search_schema_enables_trusted_extensions_and_indexes():
    sql = "\n".join(OPERATIONAL_SEARCH_SCHEMA_STATEMENTS)
    assert "CREATE EXTENSION IF NOT EXISTS unaccent" in sql
    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in sql
    assert "CREATE EXTENSION IF NOT EXISTS fuzzystrmatch" in sql
    assert "ix_people_search_name_trgm" in sql
    assert "ix_people_search_email" in sql
