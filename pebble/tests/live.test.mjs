// End-to-end check of the watch app against scripts/mock-server.py over real
// HTTP. Piu and AppMessage remain stubbed; the emulator/device covers those.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { createHarness } from "./harness.mjs";

const SERVER = resolve(import.meta.dirname, "../scripts/mock-server.py");
const TOKEN = "cfpat_test000000000000000000000000";
const python = [
  process.env.PYTHON,
  "python3",
  resolve(import.meta.dirname, "../../backend/.venv/Scripts/python.exe"),
  "python",
]
  .filter(Boolean)
  .find((candidate) => spawnSync(candidate, ["--version"]).status === 0);
const hasPython = Boolean(python);

let server;
let port;
let workdir;

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port: chosen } = probe.address();
      probe.close(() => done(chosen));
    });
  });
}

async function proxy(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function harnessFor(authToken = TOKEN) {
  return createHarness({
    storage: { authToken, apiBaseUrl: `http://127.0.0.1:${port}` },
    responder: proxy,
  });
}

before(async () => {
  if (!hasPython) return;
  workdir = mkdtempSync(join(tmpdir(), "champagne-pebble-live-"));
  port = await freePort();
  server = spawn(python, [SERVER, String(port), "--log", join(workdir, "requests.log")], {
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/pebble/registrations`);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  throw new Error("mock server did not start");
});

after(() => {
  server?.kill();
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

test("renders registrations served by the mock backend", { skip: !hasPython }, async () => {
  const harness = harnessFor();

  await harness.settle();

  assert.match(harness.title, /Champagne Tasting Evening/);
  assert.equal(harness.status, "Not checked in");
  assert.equal(new URL(harness.requests[0].url).pathname, "/api/pebble/registrations");
  assert.equal(harness.requests[0].headers.Authorization, `Bearer ${TOKEN}`);
});

test("maps a real authentication failure to the pairing state", { skip: !hasPython }, async () => {
  const harness = harnessFor("cfpat_wrong");

  await harness.settle();

  assert.equal(harness.title, "Sign-in expired");
  assert.equal(harness.stored.lastRegistration, undefined);
});
