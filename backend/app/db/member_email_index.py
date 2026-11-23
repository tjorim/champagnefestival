"""Maintain the indexed contact address on open membership periods."""

POSTGRES_MEMBER_EMAIL_STATEMENTS = (
    """
    CREATE OR REPLACE FUNCTION set_period_member_email() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        NEW.member_email := NULL;
        IF NEW.role = 'member' AND NEW.ended_on IS NULL THEN
            SELECT CASE WHEN NOT anonymised THEN NULLIF(trim(email), '') END
            INTO NEW.member_email FROM people WHERE id = NEW.person_id FOR NO KEY UPDATE;
        END IF;
        RETURN NEW;
    END;
    $$
    """,
    """
    CREATE OR REPLACE TRIGGER set_period_member_email BEFORE INSERT OR UPDATE ON person_role_periods
    FOR EACH ROW EXECUTE FUNCTION set_period_member_email()
    """,
    """
    CREATE OR REPLACE FUNCTION refresh_period_member_email() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        UPDATE person_role_periods SET member_email = NULL
        WHERE person_id = NEW.id AND role = 'member' AND ended_on IS NULL;
        RETURN NEW;
    END;
    $$
    """,
    """
    CREATE OR REPLACE TRIGGER refresh_period_member_email AFTER UPDATE OF email, anonymised ON people
    FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email OR OLD.anonymised IS DISTINCT FROM NEW.anonymised)
    EXECUTE FUNCTION refresh_period_member_email()
    """,
)

_SQLITE_EMAIL = """
CASE WHEN NEW.role = 'member' AND NEW.ended_on IS NULL THEN
    (SELECT NULLIF(trim(email), '') FROM people WHERE id = NEW.person_id AND NOT anonymised)
END
"""

SQLITE_MEMBER_EMAIL_STATEMENTS = (
    *(
        f"""
        CREATE TRIGGER IF NOT EXISTS set_period_member_email_{operation.lower()}
        AFTER {operation} ON person_role_periods
        FOR EACH ROW WHEN NEW.member_email IS NOT ({_SQLITE_EMAIL})
        BEGIN
            UPDATE person_role_periods SET member_email = {_SQLITE_EMAIL}
            WHERE person_id = NEW.person_id AND role = NEW.role AND position = NEW.position;
        END
        """
        for operation in ("INSERT", "UPDATE")
    ),
    """
    CREATE TRIGGER IF NOT EXISTS refresh_period_member_email
    AFTER UPDATE OF email, anonymised ON people
    FOR EACH ROW WHEN OLD.email IS NOT NEW.email OR OLD.anonymised IS NOT NEW.anonymised
    BEGIN
        UPDATE person_role_periods
        SET member_email = CASE WHEN NOT NEW.anonymised THEN NULLIF(trim(NEW.email), '') END
        WHERE person_id = NEW.id AND role = 'member' AND ended_on IS NULL;
    END
    """,
)
