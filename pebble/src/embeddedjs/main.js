// Watch-side (embeddedjs) code — runs natively on the watch via Moddable's
// XS engine. The package builds and this screen renders in the `emery`
// emulator; live fetches still require hardware (see ../../EMULATOR.md).
//
// Shows the visitor's most relevant registration (today's event, else the
// next upcoming one) and whether they're checked in, sourced from
// GET /api/me/registrations (backend/app/routers/me.py). The auth token
// comes from the phone's pairing webview — see ../pkjs/index.js and
// ../../README.md.

import {} from "piu/MC";
import Message from "pebble/message";

const DEFAULT_API_BASE_URL = "https://champagnefestival.tjor.im";
const SNAPSHOT_KEY = "lastRegistration";
const SNAPSHOT_VERSION = 1;
const SNAPSHOT_MAX_AGE_SECONDS = 12 * 60 * 60;

const backgroundSkin = new Skin({ fill: "black" });
// Alloy's font lookup only matches the Pebble system font table exactly
// (see modFindPebbleFont's gFonts list): Gothic-Bold exists at 18px only,
// Gothic-Regular at 9/14/18/24/28/36px. Any other size throws an uncaught
// "font not found" error during Style construction, which crashes the app
// at startup with no diagnostic (see ../../EMULATOR.md).
const titleStyle = new Style({ font: "bold 18px Gothic", color: "white" });
const statusStyle = new Style({ font: "14px Gothic", color: "silver" });

const titleLabel = new Label(null, {
  top: 20,
  left: 4,
  right: 4,
  height: 40,
  style: titleStyle,
  string: "Loading...",
});

const statusLabel = new Label(null, {
  top: 70,
  left: 4,
  right: 4,
  height: 60,
  style: statusStyle,
  string: "",
});

const application = new Application(null, {
  skin: backgroundSkin,
  contents: [
    new Column(null, {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      contents: [titleLabel, statusLabel],
    }),
  ],
});

function render(title, status) {
  titleLabel.string = title;
  statusLabel.string = status;
}

const pad = (value) => (value < 10 ? `0${value}` : String(value));

function formatClock(epochSeconds) {
  const date = new Date(epochSeconds * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function clearSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (error) {
    // A stale read-only glance is harmless if storage is unavailable.
  }
}

function saveSnapshot(registration) {
  if (!registration) {
    clearSnapshot();
    return;
  }
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        version: SNAPSHOT_VERSION,
        fetchedAt: Math.floor(Date.now() / 1000),
        registration,
      }),
    );
  } catch (error) {
    // A full or unavailable store only costs the offline glance.
  }
}

function loadSnapshot() {
  let raw;
  try {
    raw = localStorage.getItem(SNAPSHOT_KEY);
  } catch (error) {
    return null;
  }
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw);
    const age = Math.floor(Date.now() / 1000) - snapshot.fetchedAt;
    if (
      snapshot.version !== SNAPSHOT_VERSION ||
      !snapshot.registration ||
      !snapshot.fetchedAt ||
      age < 0 ||
      age > SNAPSHOT_MAX_AGE_SECONDS
    ) {
      clearSnapshot();
      return null;
    }
    return snapshot;
  } catch (error) {
    clearSnapshot();
    return null;
  }
}

function renderRegistration(registration, staleReason = null, fetchedAt = null) {
  const status = registration.checked_in ? "Checked in" : "Not checked in";
  const stale = staleReason && fetchedAt
    ? `\n${staleReason} · ${formatClock(fetchedAt)}`
    : "";
  render(
    `${registration.event_title}\n${registration.event_date}`,
    `${status}${stale}`,
  );
}

function showStale(reason) {
  const snapshot = loadSnapshot();
  if (snapshot) {
    renderRegistration(snapshot.registration, reason, snapshot.fetchedAt);
    return;
  }
  render(reason, "");
}

// Picks the registration to show: today's event if there is one, otherwise
// the soonest upcoming one. Returns null if there's nothing relevant.
function pickRelevantRegistration(registrations) {
  const today = new Date();
  const todayIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const todays = registrations.find((r) => r.event_date === todayIso);
  if (todays) return todays;

  const upcoming = registrations
    .filter((r) => r.event_date && r.event_date >= todayIso)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  return upcoming[0] ?? null;
}

async function refreshGlance(apiBaseUrl, token) {
  if (!token) {
    render("Not configured", "Open Settings on your\nphone's Pebble app");
    return;
  }
  if (!watch.connected.pebblekit) {
    showStale("Phone offline");
    return;
  }
  const generation = identityGeneration;
  try {
    const response = await fetch(`${apiBaseUrl}/api/pebble/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (generation !== identityGeneration) return;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        showStale("Sign-in expired");
      } else if (response.status === 429 || response.status >= 500) {
        showStale(`Try again later (${response.status})`);
      } else {
        showStale(`Request failed (${response.status})`);
      }
      return;
    }

    const registrations = await response.json();
    if (generation !== identityGeneration) return;
    const registration = pickRelevantRegistration(registrations);
    if (!registration) {
      clearSnapshot();
      render("No upcoming\nregistration", "");
      return;
    }

    saveSnapshot(registration);
    renderRegistration(registration);
  } catch (err) {
    if (generation !== identityGeneration) return;
    showStale("Network error");
  }
}

let authToken = localStorage.getItem("authToken");
let apiBaseUrl = localStorage.getItem("apiBaseUrl") || DEFAULT_API_BASE_URL;

let busy = false;
let identityGeneration = 0;
let refreshOwed = false;

async function runExclusive(action) {
  if (busy) return;
  busy = true;
  try {
    await action();
    while (refreshOwed) {
      refreshOwed = false;
      await refreshGlance(apiBaseUrl, authToken);
    }
  } finally {
    busy = false;
  }
}

function requestRefresh() {
  if (busy) refreshOwed = true;
  else runExclusive(() => refreshGlance(apiBaseUrl, authToken));
}

// eslint-disable-next-line no-unused-vars -- kept alive by the Message runtime, not read directly
const message = new Message({
  keys: ["API_BASE_URL", "AUTH_TOKEN"],
  onReadable() {
    const msg = this.read();
    const token = msg.get("AUTH_TOKEN");
    const baseUrl = msg.get("API_BASE_URL");
    const nextBaseUrl = baseUrl ? baseUrl.replace(/\/$/, "") : apiBaseUrl;
    if (nextBaseUrl !== apiBaseUrl || (token && token !== authToken)) {
      identityGeneration += 1;
      clearSnapshot();
    }
    if (baseUrl) {
      apiBaseUrl = nextBaseUrl;
      localStorage.setItem("apiBaseUrl", apiBaseUrl);
    }
    if (token) {
      authToken = token;
      localStorage.setItem("authToken", token);
    }
    requestRefresh();
  },
});

watch.addEventListener("connected", requestRefresh);
requestRefresh();

export {};
