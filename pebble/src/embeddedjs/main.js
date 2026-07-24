// Watch-side (embeddedjs) code — runs natively on the watch via Moddable's
// XS engine. Not run against real hardware or the `pebble` emulator; built
// from the documented Alloy APIs (piu/MC, pebble/message, fetch, localStorage,
// watch.connected) at https://developer.repebble.com/guides/alloy/.
//
// Shows the visitor's most relevant registration (today's event, else the
// next upcoming one) and whether they're checked in, sourced from
// GET /api/me/registrations (backend/app/routers/me.py). The auth token
// comes from the phone's pairing webview — see ../pkjs/index.js and
// ../../README.md.

import {} from "piu/MC";
import Message from "pebble/message";

const API_BASE = "https://champagnefestival.tjor.im";

const backgroundSkin = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "bold 20px Gothic", color: "white" });
const statusStyle = new Style({ font: "16px Gothic", color: "silver" });

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
  height: 30,
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

// Picks the registration to show: today's event if there is one, otherwise
// the soonest upcoming one. Returns null if there's nothing relevant.
function pickRelevantRegistration(registrations) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const todays = registrations.find((r) => r.event_date === todayIso);
  if (todays) return todays;

  const upcoming = registrations
    .filter((r) => r.event_date && r.event_date >= todayIso)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  return upcoming[0] ?? null;
}

async function refreshGlance(token) {
  try {
    const response = await fetch(`${API_BASE}/api/me/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      render("Sign-in expired", "Reopen Settings on\nyour phone to re-pair");
      return;
    }

    const registrations = await response.json();
    const registration = pickRelevantRegistration(registrations);
    if (!registration) {
      render("No upcoming\nregistration", "");
      return;
    }

    render(
      `${registration.event_title}\n${registration.event_date}`,
      registration.checked_in ? "Checked in" : "Not checked in",
    );
  } catch (err) {
    render("Network error", String(err));
  }
}

let authToken = localStorage.getItem("authToken");

function maybeRefresh() {
  if (!authToken) {
    render("Not paired", "Open Settings on your\nphone's Pebble app");
    return;
  }
  if (watch.connected.pebblekit) {
    refreshGlance(authToken);
  }
}

// eslint-disable-next-line no-unused-vars -- kept alive by the Message runtime, not read directly
const message = new Message({
  keys: ["AUTH_TOKEN"],
  onReadable() {
    const msg = this.read();
    const token = msg.get("AUTH_TOKEN");
    if (!token) return;
    authToken = token;
    localStorage.setItem("authToken", token);
    maybeRefresh();
  },
});

watch.addEventListener("connected", maybeRefresh);
maybeRefresh();

export {};
