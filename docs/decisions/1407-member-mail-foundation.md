# Member-mail transport foundation (#1407)

## Implemented increment — 2026-10-24

The provider-neutral boundary is `backend/app/member_mail.py`. It accepts one
recipient, an explicit sender, a stable delivery key, a category key, rendered
plain text and a category unsubscribe URL. MIME generation includes
`List-Unsubscribe` and `List-Unsubscribe-Post`. HTTPS URL validation does not
implement signed tokens or an unsubscribe endpoint.

`MEMBER_MAIL_PROVIDER=disabled` is the only supported configuration and the
default. Any other value fails settings validation. The disabled adapter returns
`disabled`, never success, and performs no network or database operations. SMTP
settings cannot enable it. There is no production transport, delivery endpoint,
provider registration mechanism or composer email channel in this increment.

Provider outcomes distinguish `accepted` (submission accepted, not delivered),
`rejected`, `unknown` (including an ambiguous timeout) and `disabled`. No outcome
automatically triggers another submission. Future adapters must map exceptions
without logging addresses, tokens or raw provider responses.

## Remaining acceptance gates

Issue #1407 remains partial and blocked on the provider decision and #1408.
Before connecting this boundary to the composer or reward creation:

- Implement category consent and role eligibility from #1408; the legacy
  marketing checkbox must never authorize member mail.
- Choose the provider, separate bulk sending identity, authenticated feedback,
  rate limits, credentials and domain authentication. Implement an explicit
  adapter and provider-specific timeout reconciliation and retry tests.
- Freeze eligible person IDs at dispatch, then recheck revocation, role,
  anonymisation and address suppression before each recipient submission.
- Implement durable per-recipient jobs, batching, rate limiting and outcome
  counts. Provider acceptance must not be presented as inbox delivery.
- Implement signed, category-scoped, login-free unsubscribe tokens and the
  one-click POST endpoint; include a visible translated unsubscribe link in mail.
- Implement suppression from verified bounce/complaint feedback, retention and
  anonymisation behavior for delivery records, snapshots and suppression data.
- Agree on sender permissions, admin test-send, count confirmation, retention
  periods and nl/fr/en wording. Implement localized rendering with Dutch fallback,
  reward-ready triggers and the composer UI.

No new personal data is persisted by this foundation. It does not change current
retention behavior or establish consent, unsubscribe or erasure compliance for a
future sending channel.
