# Public documents (repository snapshots)

Public legal text is managed in the app, not in this repository: admins draft,
preview and publish versions through the policy editor (#944; `policies` and
`policy_versions` tables, `GET /api/policies/{key}/current`). The database is the
source of truth. The files here are **snapshots** of what is published, kept so the
text is reviewable and recoverable from Git. Editing a file here changes nothing on
the site.

| Document | Key | Snapshot of | Verified against production |
| --- | --- | --- | --- |
| [Privacy policy](privacy/) (`nl`, `en`, `fr`) | `privacy` | version 1, published 2026-07-01 | 2026-10-06 (all three locales still serve version 1) |

There is no terms and conditions document: `privacy` is the only policy key, and
nothing in the frontend refers to terms. The policy framework accepts further keys
if one is ever wanted.

The snapshot is the Markdown the editor takes (the content before rendering). It
began as the text seeded by migration `001_contact_messages.py`, which is also where
the first version lives in code; later versions exist only in the database.

## Keeping a snapshot current

After publishing a new version through the editor, copy the published Markdown for each
locale into `privacy/{nl,en,fr}.md` and update the table above (version, publish date,
verification date) in the same change. A snapshot that says version 1 while production
serves version 2 is stale.

## Observed gaps in version 1 (for the owner; no text was changed)

Written down so they are not lost; whether and how to change the text is the owner's
call, and the aim stays a short, plain document.

- The Data Retention and Your Rights sections say there is no process yet to delete or
  anonymise records. An admin-triggered anonymisation exists since #934
  ([decision](../decisions/934-data-retention-and-erasure.md)), and the retention windows
  are recorded there.
- "Changes to This Policy" refers to a "last updated date above", and the stored text
  shows none.
- The Contact Us section ends with a colon and lists no details in the stored text;
  the page may append them from the contact settings (#940), which was not checked.

## Draft: shorter privacy policy (version 2, not published)

[`privacy/draft-v2/`](privacy/draft-v2/) holds a plain, shorter rewrite in `nl`, `en` and `fr`
(about 420 words per locale against 750 to 880 in version 1). It is a proposal: nothing
is published until the owner pastes it into the policy editor, and it has had no legal
review.

What it keeps, in plain language: what is collected and why, retention, who sees it,
cookies and storage, rights, changes. What it drops: the sections on how data is
transmitted and on protection (folded into "Who sees it"), the diagnostics and audit-trail
paragraph, and the children's paragraph. It no longer says that deletion and anonymisation
are not yet possible, because that stopped being true with #934.

Every statement comes from the code or a recorded decision:

| Statement | Source |
| --- | --- |
| Contact, registration, check-in code and check-in time | Version 1 text; `Registration.checkInToken`, `checkedInAt` |
| Sign-in by emailed link; staff through our self-hosted Keycloak (described in the draft as "our own login server") | [#953](../decisions/953-visitor-passwordless-session.md), `config/oidc.ts` |
| Volunteer NISS, eID, help days, meal choices | [#934](../decisions/934-data-retention-and-erasure.md), [#1006](../decisions/1006-volunteer-identity-self-service.md) |
| Push and email updates only by choice | [#941](../decisions/941-web-push-foundation.md) (explicit consent before the browser prompt); unticked-by-default marketing checkbox (#934) |
| Camera only on the device; app for volunteers and administrators only | Version 1 text; Android scanner (`android/README.md`); owner. The section stays short because the Play listing's data-safety links point at `/privacy` (`docs/play-store/data_safety.csv`) |
| Visitor and member anonymisation after about 7 years, registrations kept | #934 retention schedule |
| Volunteer identification kept for insurance | #934 (indefinite, deliberately) |
| Check-in IP addresses removed after 30 days | #934 (`tjorim/apps#192`) |
| One sign-in cookie, local storage | `visitor_session.py` (HttpOnly cookie); `config/oidc.ts` and language setting in local storage |
| Hosting provider, Cloudflare, email service | `DEPLOYMENT.md`; SMTP delivery settings in `config.py` |

For the owner to confirm before publishing:

1. **Who is the controller.** Neither version names the organiser's legal name or address,
   which a privacy policy normally states. The draft points to the contact page, as version 1
   does; add one line with the legal name if you want it complete.
2. **Contact messages** have no retention window in #934 (out of its scope). The draft says
   "as long as needed to deal with your question"; confirm that is how it is handled.
3. **Anonymisation is admin-triggered**, not automatic (#934 lists candidates and an admin
   runs it). The draft says data "is anonymised about seven years after"; confirm that is
   the practice.
4. **Check-in IP removal** is a VPS-scheduled job (`tjorim/apps#192`); confirm it runs in
   production.
5. **Error monitoring** (Sentry) is off unless a DSN is configured. Keep the phrase only if
   it is enabled in production; otherwise remove it.
6. **Marketing email.** The draft promises emails about future editions only on opt-in. No
   sender exists yet (#934); the promise stays true for any future one.
7. **Complaints:** it names the Belgian Data Protection Authority without a link; add the
   address if you want one.

To publish: in the policy editor, create a draft for each locale, paste the matching file,
preview, publish; then replace `privacy/{nl,en,fr}.md` with the new text, move the old
text out of the way (Git history keeps it), and update the table at the top (version,
dates) in the same change. This is a reading of the facts, not legal advice.
