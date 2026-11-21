"""Database bootstrap statements enforcing the payment ledger's append-only
contract (#1019) at the PostgreSQL level, not just in application code —
``payments_service`` never issues an UPDATE/DELETE against
``payment_transactions``, but nothing stops a future bug, a migration
script, or a direct psql session from doing so without this trigger. A
correction is a new payment/refund row, never an edit to history.

The one legitimate exception is administrative: wiping tables entirely (a
test fixture's blanket cleanup, or a real data-reset script) needs to bypass
this without a second database role, which this project doesn't otherwise
have. `SET LOCAL champagnefestival.allow_ledger_mutation = 'on'` opts one
transaction out; nothing sets it outside that explicit, transaction-scoped
opt-in.
"""

PAYMENT_LEDGER_SCHEMA_STATEMENTS = (
    """
    CREATE OR REPLACE FUNCTION reject_payment_transaction_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
        IF current_setting('champagnefestival.allow_ledger_mutation', true) = 'on' THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
        RAISE EXCEPTION
            'payment_transactions is append-only: % is not permitted (insert a correcting payment/refund row instead)',
            TG_OP;
    END;
    $$;
    """,
    "DROP TRIGGER IF EXISTS payment_transactions_append_only ON payment_transactions",
    """
    CREATE TRIGGER payment_transactions_append_only
    BEFORE UPDATE OR DELETE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION reject_payment_transaction_mutation()
    """,
)
