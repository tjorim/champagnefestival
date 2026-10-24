# Email categories and per-category consent (#1408)

Implemented 2026-10-24. Sending is #1407; this is only who may be mailed, and what proves it.

## Model

- `email_categories`: a stable `key`, a name and description in nl (required) / fr / en
  (missing translations fall back to Dutch), `allowed_roles` (empty means everyone) and
  `automatic`. Administrators add categories and edit texts, roles and order in the admin
  (`/api/email-categories`, admin-only). `automatic` is seeded, never editable, and a category
  can be created only as non-automatic: editing never adds a sending capability, which stays tied
  to implemented triggers. `new_editions` (the registration form feeds it) and `reward_ready`
  (the automatic reward mail) cannot be deleted; a category with consent history cannot either.
- Seeded by migration `010`: **Club news** (members), **New festival editions** (everyone),
  **Volunteer news** (volunteers), **Reward ready** (members, automatic), each in nl/fr/en.
  Everyone starts unsubscribed; nothing was migrated from `Person.marketing_opt_in`, which is gone.
- `email_consents`: one row per grant — `person_id`, `category_key`, `granted_at`, `source`
  (`self_service`, `registration_form`), and when it ended `revoked_at` / `revoked_source`
  (`self_service`, `admin`, `merged`). At most one open grant per person and category (partial
  unique index); a new grant after a withdrawal is a new row, so history survives.
- `email_consent_confirmations`: a pending, emailed request (token hash only, 7-day expiry).

## Who can consent, and for which address

- Consent belongs to the recipient `Person`, and a signed-in caller reaches people only through
  their **verified email address**: the people whose email equals it (a Keycloak token needs
  `email_verified`, an emailed-link session proved the address). A booking linked through
  `Registration.user_id` gives no access to its contact address. Changing booking ownership is a
  separate review.
- The person sees the categories a person with that address may use: no retired role, no
  anonymised record, and the category's roles must be held. A category with an open consent stays
  listed after the role ended, so it can be withdrawn. When several people share an address, a new
  grant is recorded on the best match that may use the category (most current roles, then oldest);
  withdrawing ends every open record for the address.
- `GET`/`PUT /api/me/email-preferences` (cookie or bearer, `Cache-Control: no-store`). `PUT` sets
  an absolute wanted state for the listed keys (the rest stay as they are); every key is validated
  before anything is written. There is no extra confirmation: the person is already signed in with
  the verified address.
- **Registration form.** The updates option stays, as `new_editions_opt_in`. Ticking it is a
  request, not consent: it is active at once only when the caller is signed in with exactly the
  person's address; otherwise a confirmation mail is sent and the consent starts when its
  single-use link is confirmed with a click on `/email-consent` (not on load, so a scanner opening
  the link cannot confirm). An absent checkbox never revokes anything, and the same person is not
  mailed again within an hour. The mail is sent directly after the registration commits (only the
  token hash is stored), so a failure leaves the registration intact and the request can be made
  again.
- Administrators see a person's history (`GET /api/people/{id}/email-consents`) and can record an
  opt-out (`POST …/{key}/opt-out`). No endpoint grants consent for anyone else.

## Roles at send time

`email_categories_service.person_allows` is the single rule: the person holds a role of the
category that is not retired, and is not anonymised. It is applied when consent is given and must
be applied again, per recipient, when mail is sent (#1407); a retired role stops the category while
the consent record stays.

## Retention and erasure

- Consent history (category, grant and withdrawal dates, source) is kept through anonymisation.
- A person with any open consent keeps their email address when anonymised (the subscription is
  not silently ended); a pending confirmation is dropped. The owner of that address still sees the
  retained consent in their preferences and can withdraw it, but an anonymised record never takes a
  new grant. Deleting a person is an erasure and
  removes their consent rows with them (`ON DELETE CASCADE`).
- Merging people moves the consent history to the surviving person. A category the survivor
  already has open keeps the survivor's record. Consent given for an address the survivor does not
  have is closed as `merged` and kept as history rather than mailing a different address.
- Expired confirmations are removed by the daily housekeeping. Person anonymisation remains a
  manual, per-person admin action; any future automatic anonymisation needs admin confirmation.
