from app.audit import audit_provenance


def test_audit_provenance_preserves_authentication_identity() -> None:
    assert audit_provenance("anonymous") == ("none", None, None)
    assert audit_provenance("keycloak-subject") == ("keycloak", "keycloak-subject", None)
    assert audit_provenance("integration:ic-123") == (
        "integration",
        "integration:ic-123",
        "ic-123",
    )
