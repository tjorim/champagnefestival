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
