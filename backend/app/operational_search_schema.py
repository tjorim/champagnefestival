"""Database bootstrap statements for indexed operational person lookup."""

# SQLite twin (local development and tests): the same derived columns, kept current by triggers that
# call the Python functions of app.sqlite_functions. SQLite has no BEFORE-trigger assignment, so the
# trigger updates the row after it is written; UPDATE OF name, email keeps it from re-firing itself.
_SQLITE_SET_SEARCH_VALUES = """
    UPDATE people SET
        search_name = champagne_search_name(NEW.name),
        search_name_alt = champagne_search_name_alt(NEW.name),
        search_email = lower(NEW.email)
    WHERE id = NEW.id;
"""
OPERATIONAL_SEARCH_SQLITE_STATEMENTS = (
    "DROP TRIGGER IF EXISTS people_operational_search_values_insert",
    "DROP TRIGGER IF EXISTS people_operational_search_values_update",
    f"CREATE TRIGGER people_operational_search_values_insert AFTER INSERT ON people BEGIN {_SQLITE_SET_SEARCH_VALUES} END",
    "CREATE TRIGGER people_operational_search_values_update AFTER UPDATE OF name, email ON people "
    f"BEGIN {_SQLITE_SET_SEARCH_VALUES} END",
    "UPDATE people SET name = name, email = email WHERE search_name = ''",
    "CREATE INDEX IF NOT EXISTS ix_people_search_email ON people (search_email)",
)

OPERATIONAL_SEARCH_SCHEMA_STATEMENTS = (
    "CREATE EXTENSION IF NOT EXISTS unaccent",
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE EXTENSION IF NOT EXISTS fuzzystrmatch",
    """
    CREATE OR REPLACE FUNCTION update_person_operational_search_values() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
        NEW.search_name := trim(regexp_replace(lower(unaccent(NEW.name)), '[^[:alnum:]]+', ' ', 'g'));
        NEW.search_name_alt := trim(regexp_replace(lower(unaccent(
            replace(replace(replace(replace(lower(NEW.name), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')
        )), '[^[:alnum:]]+', ' ', 'g'));
        NEW.search_email := lower(NEW.email);
        RETURN NEW;
    END;
    $$;
    """,
    "DROP TRIGGER IF EXISTS people_operational_search_values ON people",
    """
    CREATE TRIGGER people_operational_search_values
    BEFORE INSERT OR UPDATE OF name, email ON people
    FOR EACH ROW EXECUTE FUNCTION update_person_operational_search_values()
    """,
    # Fire the BEFORE UPDATE trigger for rows whose derived columns haven't been populated yet.
    "UPDATE people SET name = name, email = email WHERE search_name = ''",
    "CREATE INDEX IF NOT EXISTS ix_people_search_name_trgm ON people USING gin (search_name gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_name_alt_trgm ON people USING gin (search_name_alt gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_email ON people (search_email)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_email_trgm ON people USING gin (search_email gin_trgm_ops)",
)
