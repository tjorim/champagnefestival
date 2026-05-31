# Authenticated Operational Lookup

Operational lookup is centralized in the backend so web, Android, and MCP
clients use the same normalization, ranking, privacy rules, and result bounds.

## Privacy Boundary

Fuzzy suggestions are only available to authenticated volunteers and admins.
Public visitor registration recovery remains exact email-based through
`POST /api/registrations/my/request`; it does not expose candidates.

## Matching Policy

| Field | Behavior |
|---|---|
| Person name | Accent-insensitive exact and substring matching, then ranked trigram suggestions |
| Authorized email | Case-insensitive exact match first, then tightly bounded trigram suggestions |
| Table visible label or ID | Deterministic normalization and substring matching only |
| Registration ID, event ID, event title | Deterministic case-insensitive matching only |
| Order product and category | Deterministic normalized matching only |
| Numeric values and quantities | Exact deterministic matching only; never fuzzy |

Person lookup uses PostgreSQL `unaccent` and `pg_trgm` over trigger-maintained
normalized columns. Authorized email suggestions use `fuzzystrmatch`
Levenshtein distance with a small maximum edit distance. The alternate name column covers common German
transliterations such as `Mueller` for `Müller`; the primary `unaccent` rules
cover diacritics and ligatures used across European names.

## REST Consumers

Android volunteer lookup uses:

```text
GET /api/volunteer/registrations?q=...&event_id=...&order_category=...&delivery_state=...
GET /api/volunteer/tables/resolve?reference=Table%2012
GET /api/volunteer/table-orders?table_reference=Table%2012
```

The endpoint returns at most 20 rows unless a bounded `limit` is supplied.
Results omit email, phone, address, and identity fields.

The PWA admin person picker uses:

```text
GET /api/people?q=...&active=true
GET /api/registrations?q=...
```

This admin-only endpoint uses the same person-name and email ranking while
retaining deterministic matching for admin-only fields. The registration table
delegates active text searches to the backend instead of filtering its local
snapshot literally.

## MCP Consumers

- `find_guest(name?, email?)` uses the shared PostgreSQL-backed person ranking
  and returns bounded registration references for follow-up order reads.
- `resolve_table_reference(reference)` resolves a visible table label without
  fuzzy numeric matching.
- `get_table_order_summary(table_id?, table_reference?)` accepts a visible
  reference and returns candidates instead of auto-selecting ambiguous matches.
