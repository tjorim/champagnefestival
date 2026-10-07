# Organisation terminology (#1190)

Decided 2026-10-07 by the owner. Use **organisation** as the generic UI term
for the record representing a producer, sponsor or vendor:

- English: organisation / organisations.
- Dutch: organisatie / organisaties.
- French: organisation / organisations.

The term covers commercial companies and associations without implying a
partnership or an organising role. Keep producer, sponsor and vendor labels
where the specific type matters. The account page uses “My organisations”,
“Mijn organisaties” and “Mes organisations”. A privately sponsoring individual
can still have a listing; this wording introduces no legal-form restriction.

“Exhibitor” suggested a stand; “partner” implied closer involvement; “business”
was not a natural label for associations. Organisation is the agreed umbrella.

## Compatibility and scope

This is a wording change. Existing `Exhibitor` types, database tables, API/MCP
routes and fields, translation keys, configuration names, outbox job names and
stable email Message-IDs retain their identifiers. Documentation using exhibitor
for those contracts or historical issue specifications refers to the same record.
New code identifiers and comments use American English `organization` when the
new terminology is needed; user-facing English uses British `organisation`.
No write semantics or retry guarantees change.
