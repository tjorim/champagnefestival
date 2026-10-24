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

## Implemented increment — 2026-10-25: composer channel, unsubscribe, suppression

Still behind the disabled adapter: `member_mail_available()` is false until an adapter exists and
`MEMBER_MAIL_FROM` (bulk sender, never `SMTP_FROM`) and `MEMBER_MAIL_SIGNING_KEY` are set, so
scheduling an `email` message returns `409 member_mail_unavailable`.

- **Composer.** Channel `email` with `email_category_key` (required exactly with the channel; the
  category must exist and not be `automatic`, so `reward_ready` cannot be composed). Dispatch freezes the
  audience as `email_audience_snapshot` (person ids) and enqueues one `composer_message_email` job per
  recipient, staggered to `MEMBER_MAIL_MAX_PER_MINUTE`. If member mail became unavailable between
  scheduling and dispatch nothing is dispatched (the message stays `scheduled`, no channel is sent
  partially). The MCP composer tools do not offer the channel.
- **Audience** (`member_mail_audience`): open consent for the category, `person_allows` (role not
  retired, not anonymised), an address, address not suppressed, one person per address. Rechecked per
  recipient just before submission; a recipient who fails the recheck ends as *skipped*.
- **One attempt.** Jobs have `max_attempts=1`. Every non-accepted outcome raises a `MemberMailNotSent`
  subclass whose class name becomes the job's error code (`MemberMailSkipped`, `MemberMailRejected`,
  `MemberMailUncertain`, `MemberMailUnavailable`), so counts distinguish accepted / skipped / failed
  without storing addresses. A job reclaimed after a worker died (`attempt_count > 1`) is *not*
  resubmitted. Counts say "accepted", never "delivered".
- **Rendering.** One plain-text mail in `preferred_language` (Dutch fallback per language, like push),
  with the link and a translated footer carrying the visible unsubscribe link. Footer wording is
  provisional.
- **Unsubscribe.** `POST /api/mail/unsubscribe?token=` (public, rate limited, 204). Token =
  `base64url(person_id NL category_key).HMAC-SHA256`, category-scoped, no expiry, never a session. It
  ends every open consent for that category among people sharing the person's address
  (`revoked_source = unsubscribe_link`), converges on repeat or for a deleted person, and answers 404
  `unsubscribe_token_invalid` otherwise. Rotating the key invalidates mailed links. The same URL serves
  people: `GET` redirects (303) to the frontend page `/email-unsubscribe` (nl/fr/en), which names the
  category (`GET /api/mail/unsubscribe/category`, read-only) and unsubscribes only on a click, so a mail
  scanner following the link changes nothing.
- **Suppression.** `email_suppressions` keeps only a SHA-256 of the normalised address with a reason
  (`hard_bounce`, `complaint`); entries are never removed automatically and are not erased with a
  person (a hash is not the address). `email_suppression_service.suppress` exists; the feedback
  receiver that calls it needs the chosen service.
- Part of migration `010` (the former 011–014 were folded into it before release).

## Implemented increment — 2026-10-25 (2): reward-ready mail, composer UI, count confirmation

- **Reward-ready mail** (`services/reward_mail.py`): when a stamp-card reward is created and member
  mail is available and the card's person consents to `reward_ready` (member role), a
  `reward_ready_email` job (one attempt) is queued in the same transaction. Nothing is queued
  otherwise, so rewards earned while mailing is off never produce a late mail. The handler rechecks
  eligibility and skips a reward already handed out. Subject/body in nl/fr/en (wording provisional).
- **Count confirmation:** scheduling an `email` message requires `expected_email_audience` equal to the
  current estimate (`400 email_audience_confirmation_required`, `409 email_audience_changed`), so
  nobody mails a list they did not see. The MCP schedule tool therefore cannot send email.
- **Composer UI:** email channel, composable (non-automatic) category select, estimated recipients,
  the count in the send confirmation, accepted/skipped/failed/pending results, translated errors.
- A separate admin test-send was not built: it would need a signed unsubscribe link for a
  non-recipient. The recipient-count confirmation plus the single-recipient category choice is the
  safeguard until the owner asks for it.

## Remaining acceptance gates

Issue #1407 stays open only for what needs the owner's sending-service decision:

- Choose the provider, separate bulk sending identity (subdomain/stream, SPF/DKIM/DMARC), authenticated
  feedback, rate limits and credentials. Implement an explicit adapter (the `MemberMailProvider`
  contract and `member_mail.submit` are ready) with provider-specific timeout reconciliation tests, add
  its name to `MEMBER_MAIL_PROVIDER`, and map verified bounce/complaint feedback to
  `email_suppression_service.suppress`.
- Send a real test mail and record the evidence, then close.
- Final sign-off of the nl/fr/en wording, who may send (today every admin) and retention of audience
  snapshots and sent-mail jobs (they follow the outbox retention window today).

Provider acceptance must not be presented as inbox delivery.
