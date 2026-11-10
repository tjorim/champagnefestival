# Redact compatibility checks

Run from the frontend package (repository root for Bordertax):

```sh
pnpm exec playwright install --with-deps firefox webkit
pnpm test:compatibility:runtime
pnpm test:compatibility:browsers
# Both, sequentially:
pnpm test:compatibility
```

The runtime lane runs selected existing component tests with Redact for both hooks
and DOM rendering. An identity assertion fails if either silently resolves to native
React. Testing Library and Lucide use their ESM entries so CommonJS cannot load a
second renderer. Happy DOM's non-enumerable Event getters are normalized to browser
Web IDL enumerability; event values and assertions remain unchanged. This is focused
coverage, not a claim that the entire native React unit suite runs under Redact.

The browser lane reuses existing functional assertions in Firefox and WebKit, with
one worker to bound resource use. It is opt-in: it currently exposes unresolved
browser/baseline failures and is not a replacement for the Chromium CI gate.
`REMOTE_FIREFOX_WS_ENDPOINT` and `REMOTE_WEBKIT_WS_ENDPOINT` optionally connect to
matching Playwright browser servers on a supported Linux distribution. WebKit on
Linux is useful engine coverage; it does not replace testing Safari on Apple devices.

`vite.compatibility.config.ts` removes only Redact's plugins for a native React
baseline and gives its dev dependency cache a separate directory. For example:

```sh
pnpm exec vite build -c vite.compatibility.config.ts --outDir node_modules/.compatibility-react-dist
```

Do not run multiple commands which generate Paraglide output in the same package
at once. Stop dev servers before starting unit tests/builds.

## Verification recorded on 2026-11-10

All five focused Redact runtime suites passed: Bordertax 5, Champagnefestival 4,
Daynest 4, Travel 3, Worktime 5 tests. Ordinary unit suites continue using native React.

Browser results from the migration checkout:

- Bordertax: all 18 WebKit cases passed; 9 Firefox cases passed and 9 crashed
  during native select/accessibility operations. The selected failing cases also
  crashed against a native React production build, including in the official Ubuntu
  Playwright container. These failures remain unresolved; they are not passes.
- Daynest: all 8 selected cases passed in each of Firefox and WebKit, including
  calendar navigation, guarded template dialogs, focus and accessibility.
- Travel: WebKit passed the desktop English agenda create/guard/focus flow and map
  accessibility case. Firefox reached the agenda dialog but crashed during axe in
  both Redact and native React runs. The full Firefox/WebKit matrix is not verified.
- Champagnefestival: WebKit passed all 4 authenticated message-editor cases and 3
  public display cases. Registration submission and focus cases failed; submission
  also failed against native React. Increasing the overall diagnostic run budget
  did not resolve submission. These public registration failures remain unresolved.
- Worktime: the first 15 Firefox cases passed (calendar drag/drop, portal pickers,
  confirmations, themes and viewport variants) before the resource-heavy run was
  deliberately stopped. This is partial coverage, not a completed browser suite.
  A later WebKit attempt could not connect to the browser server, so it provides
  no Worktime WebKit result. A later Champagnefestival Firefox admin attempt had
  the same infrastructure failure and likewise provides no compatibility result.

Champagnefestival CI passed all four Chromium E2E shards and the CI gate at
183f80a6e18776108e7b02b9a3d97a750083eae6. CodeRabbit skipped automatic review;
that is not an independent review. New commits need their own CI results.

## Responsiveness limits

A lab comparison of production builds exercised Bordertax's Home ratio chart and
scenario comparison while editing salary, with four alternating runs per runtime.
The benchmark source and raw results live in Bordertax's `scripts/runtime-benchmark.mjs`
and `docs/redact-runtime-benchmark.json`. Event Timing entries below 16 ms are omitted
and durations are quantized. Results describe this machine and these flows, not
field INP or the other four applications. Their heavy-screen performance still needs
measurement before claiming performance parity across all apps.
