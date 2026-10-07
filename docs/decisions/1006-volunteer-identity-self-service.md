# Volunteer identity self-service (#1006)

## Registration and authorisation

Every `/api/me/volunteer/*` endpoint requires the OIDC volunteer role and resolves
the caller's own `Person.oidc_subject` link (nullable, unique). The realm role
allows volunteer operations; the link identifies the particular person.

`POST /api/me/volunteer/register` accepts name, NISS and eID document number.
Both identifiers must pass modulo-97 checksum validation before any write.
Checksums catch invalid numbers, but do not independently prove whose identity
was submitted. Registration trusts the self-report of an authorised volunteer.

Registration creates a volunteer Person or adopts an unlinked record whose NISS
and eID both exactly match, preserving imported history. Partial matches or a
record linked to someone else return 409. Candidate adoption is locked against
concurrent claims. An already-linked caller receives their existing record.
Admins can set or clear `oidc_subject` through REST or MCP; MCP supports an
explicit `clear_oidc_subject` flag.

## Reads and corrections

`GET /api/me/volunteer` returns the linked volunteer's own identity data.
`POST /api/me/volunteer/eid-correction` directly updates their eID document number
after the same checksum validation as registration. It requires no administrator
review and creates no contact message or notification. Repeating the current value
is a no-op. Audits record that the field changed, without storing the raw digits.
There is no automatic renewal prompt or expiry of the recorded document number.

The Volunteer eID tab on [the unified page](unified-self-service-page.md) validates
numbers for immediate feedback and formats the eID for display; stored values
are digits only. The self-service endpoints have no MCP equivalent.
See [retention and restricted identity reads](934-data-retention-and-erasure.md)
and [retry safety](../retry-safety.md) for the associated contracts.
