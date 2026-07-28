import assert from "node:assert/strict";
import { test } from "node:test";
import { createHarness, registration, snapshot } from "./harness.mjs";

const TOKEN = {
  authToken: "cfpat_test",
  apiBaseUrl: "https://example.test",
};

test("a live registration is rendered and cached", async () => {
  const current = registration();
  const harness = createHarness({
    storage: TOKEN,
    responder: () => ({ status: 200, body: [current] }),
  });

  await harness.settle();

  assert.match(harness.title, /Champagne Tasting/);
  assert.equal(harness.status, "Not checked in");
  assert.equal(JSON.parse(harness.stored.lastRegistration).registration.id, current.id);
});

test("an offline cold start shows the cached registration and does not fetch", async () => {
  const harness = createHarness({
    connected: false,
    storage: { ...TOKEN, lastRegistration: snapshot(registration()) },
  });

  await harness.settle();

  assert.match(harness.title, /Champagne Tasting/);
  assert.match(harness.status, /Phone offline · \d\d:\d\d/);
  assert.deepEqual(harness.requests, []);
});

test("a cache older than 12 hours is discarded", async () => {
  const harness = createHarness({
    connected: false,
    storage: {
      ...TOKEN,
      lastRegistration: snapshot(registration(), 13 * 60 * 60),
    },
  });

  await harness.settle();

  assert.equal(harness.title, "Phone offline");
  assert.equal(harness.stored.lastRegistration, undefined);
});

test("a snapshot stamped in the future is discarded", async () => {
  const harness = createHarness({
    connected: false,
    storage: {
      ...TOKEN,
      lastRegistration: snapshot(registration(), -600),
    },
  });

  await harness.settle();

  assert.equal(harness.title, "Phone offline");
  assert.equal(harness.stored.lastRegistration, undefined);
});

test("retryable failures preserve the last useful glance", async () => {
  const harness = createHarness({
    storage: { ...TOKEN, lastRegistration: snapshot(registration()) },
    responder: () => ({ status: 503, body: {} }),
  });

  await harness.settle();

  assert.match(harness.title, /Champagne Tasting/);
  assert.match(harness.status, /Try again later \(503\) · \d\d:\d\d/);
});

test("reconnecting refreshes the registration", async () => {
  const harness = createHarness({
    connected: false,
    storage: { ...TOKEN, lastRegistration: snapshot(registration()) },
    responder: () => ({
      status: 200,
      body: [registration({ event_title: "Refreshed event", checked_in: true })],
    }),
  });

  await harness.settle();
  await harness.reconnect();

  assert.match(harness.title, /Refreshed event/);
  assert.equal(harness.status, "Checked in");
  assert.equal(harness.requests.length, 1);
});

test("a changed pairing clears data from the previous account", async () => {
  const harness = createHarness({
    connected: false,
    storage: { ...TOKEN, lastRegistration: snapshot(registration()) },
  });

  await harness.settle();
  await harness.configure({ AUTH_TOKEN: "cfpat_other" });

  assert.equal(harness.stored.lastRegistration, undefined);
  assert.equal(harness.title, "Phone offline");
});

function heldResponder(body) {
  let release;
  return [
    () => ({
      status: 200,
      body: new Promise((resolve) => {
        release = () => resolve(body);
      }),
    }),
    () => release(),
  ];
}

test("a reconnect during another request is serviced", async () => {
  const [held, release] = heldResponder([registration()]);
  const harness = createHarness({ storage: TOKEN, responder: held });
  await harness.settle();

  harness.emit("connected");
  release();
  await harness.settle();

  assert.equal(harness.requests.length, 2);
});

test("an old account response is discarded after pairing changes", async () => {
  const [held, release] = heldResponder([
    registration({ event_title: "Old account event" }),
  ]);
  const harness = createHarness({ storage: TOKEN, responder: held });
  await harness.settle();

  await harness.configure({ AUTH_TOKEN: "cfpat_other" });
  harness.setResponder(() => ({ status: 503, body: {} }));
  release();
  await harness.settle();

  assert.equal(harness.title, "Try again later (503)");
  assert.equal(harness.stored.lastRegistration, undefined);
  assert.equal(harness.requests.at(-1).headers.Authorization, "Bearer cfpat_other");
});
