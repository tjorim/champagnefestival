import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { resolve } from "node:path";

const MAIN_PATH = resolve(import.meta.dirname, "../src/embeddedjs/main.js");
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function stripImports(source) {
  return source
    .replace(/^import .*;\s*$/gm, "")
    .replace(/^export \{\};\s*$/gm, "");
}

export function snapshot(registration, ageSeconds = 0) {
  return JSON.stringify({
    version: 1,
    fetchedAt: Math.floor(Date.now() / 1000) - ageSeconds,
    registration,
  });
}

export function registration(overrides = {}) {
  return {
    id: "reg_today",
    event_title: "Champagne Tasting",
    event_date: new Date().toISOString().slice(0, 10),
    checked_in: false,
    ...overrides,
  };
}

export function createHarness({
  connected = true,
  storage = {},
  responder = () => ({ status: 200, body: [] }),
} = {}) {
  const store = new Map(Object.entries(storage));
  const requests = [];
  const labels = [];
  const listeners = new Map();
  const inFlight = new Set();
  const hooks = {};
  let respond = responder;

  class Label {
    constructor(_parent, spec) {
      Object.assign(this, spec);
      labels.push(this);
    }
  }

  class Message {
    constructor(spec) {
      this.onReadable = spec.onReadable;
      hooks.message = this;
    }
  }

  const context = createContext({
    Application: class Application {},
    Column: class Column {},
    Label,
    Message,
    Skin: class Skin {},
    Style: class Style {},
    console,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    watch: {
      connected: { pebblekit: connected },
      addEventListener: (type, handler) => listeners.set(type, handler),
    },
    fetch: (url, options = {}) => {
      requests.push({ url, method: options.method, headers: options.headers });
      const work = (async () => {
        const { status, body } = await respond(url, options);
        return {
          status,
          ok: status >= 200 && status < 300,
          json: async () => body,
        };
      })();
      inFlight.add(work);
      const forget = () => inFlight.delete(work);
      work.then(forget, forget);
      return work;
    },
  });

  runInContext(stripImports(readFileSync(MAIN_PATH, "utf8")), context, {
    filename: "main.js",
  });

  async function settle(timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (inFlight.size) {
        await Promise.race([Promise.allSettled([...inFlight]), pause(5)]);
      }
      for (let index = 0; index < 20; index += 1) await Promise.resolve();
      await pause(0);
      if (!inFlight.size) return;
      if (Date.now() > deadline) throw new Error("watch app did not settle");
    }
  }

  return {
    requests,
    get title() {
      return labels[0].string;
    },
    get status() {
      return labels[1].string;
    },
    get stored() {
      return Object.fromEntries(store);
    },
    setResponder(handler) {
      respond = handler;
    },
    async settle() {
      await settle();
    },
    async reconnect() {
      context.watch.connected.pebblekit = true;
      listeners.get("connected")?.();
      await settle();
    },
    async configure(payload) {
      const message = new Map(Object.entries(payload));
      hooks.message.read = () => message;
      hooks.message.onReadable.call(hooks.message);
      await settle();
    },
    emit(type) {
      listeners.get(type)?.();
    },
  };
}
