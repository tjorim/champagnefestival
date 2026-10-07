# Unified self-service page

`/me` serves visitors, organisation contacts, members and volunteers without
forcing an OIDC redirect. Tabs appear according to the current identity and data:

- **Registrations:** email-session sign-in and owned bookings, or direct OIDC
  booking reads. OIDC claiming uses [explicit confirmation](1044-confirm-first-registration-claiming.md)
  for the caller's own verified email.
- **Organisations:** current verified contacts' organisations and private proposals,
  using the [shared login](1192-organization-manager-login.md).
- **Volunteer eID:** OIDC accounts with the volunteer role use
  [identity self-service](1006-volunteer-identity-self-service.md).
- **Account:** OIDC account controls, including account deletion.

An emailed contact with organisations and no bookings goes straight to their
organisations. A single applicable tab renders without tab controls. Inactive
panels remain mounted to preserve form state, but are hidden and inert.

OIDC errors appear inline without blocking email sign-in. Email sign-out lives
on the shared page and clears booking and organisation views only after confirmed
server revocation. Failed sign-out preserves the views and reports an error.
Session fences discard late private responses; see [retry safety](../retry-safety.md).

Email links use `/me?token=…`; the token is removed before redemption. Public
navigation remains gated on [production email verification](953-visitor-passwordless-session.md#production-gate).
