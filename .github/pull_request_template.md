## Summary

-

## Testing

- [ ] Tests added or updated where behavior changed

## Externally callable writes

- [ ] This change adds no externally callable write, **or** I updated [`docs/retry-safety.md`](../docs/retry-safety.md) with its retry-safety decision.
- [ ] Retry behavior is consistent across every shared REST, MCP, Android, Pebble, browser, or automation surface.
- [ ] Sequential retry and concurrent-duplicate behavior are tested, or the inventory explicitly says why the operation must not be retried.
- [ ] Authorization and audit attribution remain identical on first execution and retry.
- [ ] Any replay cache documents its retry window and bounded retention, and uses the VPS scheduler rather than an in-process scheduler for production cleanup.

## UI dependency or shared-component changes

For Base UI/shadcn updates, follow [the UI maintenance workflow](https://github.com/tjorim/champagnefestival/blob/main/docs/ui-maintenance.md).

- [ ] Run `ui:check` and `ui:test` from the app package directory.
- [ ] Review runtime release notes and affected direct primitive consumers.
- [ ] Compare captured upstream changes and local registry diffs where applicable; record keep/apply decisions without overwriting app customisations.
- [ ] Record interaction, theme/mobile/localisation and bundle validation, including any independently reproduced baseline failures. Update reviewed snapshots only after the corresponding source review.
