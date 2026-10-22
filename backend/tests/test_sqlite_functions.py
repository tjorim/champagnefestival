"""app.sqlite_functions: Python versions of the PostgreSQL functions, checked against the documented behaviour."""

import pytest

from app import sqlite_functions as f


def test_similarity_matches_the_pg_trgm_documentation():
    # https://www.postgresql.org/docs/current/pgtrgm.html: similarity('word','two words') = 0.363636
    assert f.similarity("word", "two words") == pytest.approx(0.363636, abs=1e-6)
    assert f.similarity("abc", "abc") == 1.0
    assert f.similarity("abc", "xyz") == 0.0
    assert f.similarity(None, "abc") is None


def test_word_similarity_matches_the_pg_trgm_documentation():
    # word_similarity('word','two words') = 0.8: the best extent of the second string is "word".
    assert f.word_similarity("word", "two words") == pytest.approx(0.8)
    similar = f.word_similarity("Dupont", "marie dupond")
    assert similar is not None and similar > 0.5
    assert f.word_similarity("dupont", "dupont") == 1.0
    assert f.word_similarity("dupont", None) is None


def test_trigrams_pad_each_word_and_ignore_case_and_punctuation():
    assert f._trigrams("Cat!") == ["  c", " ca", "cat", "at "]
    assert f._trigrams("a-b") == ["  a", " a ", "  b", " b "]


def test_unaccent_folds_accents_and_ligatures_but_keeps_case():
    assert f.unaccent("Élodie Œuvre ß Łódź") == "Elodie OEuvre ss Lodz"
    assert f.unaccent(None) is None


def test_search_values_match_the_postgresql_trigger():
    assert f.search_name("  Élodie  Müller-Smith ") == "elodie muller smith"
    assert f.search_name_alt("Müller") == "mueller"
    assert f.search_name("Müller") == "muller"
    assert f.search_name(None) is None


def test_levenshtein_less_equal_returns_the_distance_or_something_above_the_limit():
    assert f.levenshtein_less_equal("kitten", "sitting", 5) == 3
    assert f.levenshtein_less_equal("same", "same", 2) == 0
    for left, right in (("abcdef", "uvwxyz"), ("a", "abcdef")):
        distance = f.levenshtein_less_equal(left, right, 2)
        assert distance is not None and distance > 2


def test_greatest_ignores_nulls_like_postgresql():
    assert f.greatest(1, None, 3) == 3
    assert f.greatest(None, None) is None
    assert f.greatest(0, -5) == 0


def test_json_extract_path_text():
    document = '{"a": {"b": "text", "n": 3, "gone": null}, "list": [10, 20]}'
    assert f.json_extract_path_text(document, "a", "b") == "text"
    assert f.json_extract_path_text(document, "a", "n") == "3"
    assert f.json_extract_path_text(document, "a", "gone") is None
    assert f.json_extract_path_text(document, "a", "missing") is None
    assert f.json_extract_path_text(document, "list", "1") == "20"
    assert f.json_extract_path_text(None, "a") is None
