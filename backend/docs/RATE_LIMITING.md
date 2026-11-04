# REST rate limiting

## Request-limit contract

Rate limiting uses public FastAPI dependencies and the public `limits` API.
Full route templates include static router prefixes: methods and different IDs
share a bucket, while different prefixes and clients remain independent.
`Retry-After` and `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset` survive explicit responses, authentication/validation errors
and streams. Multiple configured windows are supported; a rejection reports the
longest exhausted window. A 429 is not cacheable and is raised before the route
handler; it does not make an uncertain earlier write safe to retry. Reconcile
writes after a timeout rather than automatically replaying them.

Client keys validate `X-Real-IP` only behind the private immediate Caddy peer;
malformed values fall back to the peer. IPv6 subscribers share a /64 bucket and
IPv4-mapped addresses share the IPv4 bucket. Keep the API port private and Caddy's
header replacement enabled; private-peer trust relies on that network boundary.

Counters are fixed-window and process-local; the current Docker command starts
one worker. Restarting resets counters. Add shared storage before deploying
multiple workers or replicas; do not multiply the effective allowance silently.

Review access logs by client and route before rollout, particularly shared NATs
and polling clients. Keep existing thresholds and exemptions. Where enforcement
or bucket grouping changes, `RATE_LIMIT_ENABLED=false` can stage rollout while
traffic is measured; it is not a shadow-counting mode. Monitor 429 rates when
enabling enforcement. Mounted MCP applications retain their own policies.

Purpose-specific 429 responses retain their own backoff and quota headers. A
general allowance never overwrites a stricter endpoint policy or reports a
positive general balance as the cause of that rejection.

Body admission runs after route selection but before the first body read, so
malformed JSON consumes the same allowance and an exhausted request is rejected
before decoding. The dependency covers bodyless requests; a per-request marker
prevents double charging. Mounted applications remain outside the REST policy.
