// Phone-side (pkjs) companion script.
//
// Runs on the phone, not the watch. Responsible for the two things pkjs is
// documented to handle that embeddedjs can't: network access and (per Alloy
// docs) location. This file only handles network access.
//
// See ../../README.md ("Open design question: authentication") before
// treating this as more than a sketch — getAccessToken() below is an
// unresolved stub, not a working implementation.

const API_BASE = "https://champagnefestival.tjor.im";

// TODO(auth): resolve how this app obtains an OIDC Bearer JWT for
// /api/me/*. The Android app does a full Authorization Code + PKCE browser
// flow (android/.../core/auth/AuthManager.kt); it isn't yet known whether
// Alloy's pkjs sandbox can drive the same system-browser redirect, or
// whether a different pairing mechanism (e.g. a pairing code typed in from
// the web portal) is needed. Until that's resolved, this always fails.
async function getAccessToken() {
  throw new Error("pebble companion auth not implemented yet — see README.md");
}

// Picks the registration to show on the watch: today's event if there is
// one, otherwise the soonest upcoming event. Returns null if the visitor
// has no registrations at all.
function pickRelevantRegistration(registrations) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const todays = registrations.find((r) => r.event_date === todayIso);
  if (todays) return todays;

  const upcoming = registrations
    .filter((r) => r.event_date && r.event_date >= todayIso)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  return upcoming[0] ?? null;
}

async function fetchGlanceData() {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/api/me/registrations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`GET /api/me/registrations failed: ${response.status}`);
  }
  const registrations = await response.json();
  return pickRelevantRegistration(registrations);
}

// TODO(verify): the actual watch<->phone messaging API for Alloy is not yet
// confirmed (classic PebbleKit used Pebble.sendAppMessage; Alloy's
// equivalent needs checking against real docs/examples before use).
async function sendGlanceToWatch(registration) {
  const payload = registration
    ? {
        eventTitle: registration.event_title,
        eventDate: registration.event_date,
        checkedIn: registration.checked_in,
      }
    : { eventTitle: null };

  // TODO(verify): replace with the confirmed Alloy messaging call.
  console.log("would send to watch:", JSON.stringify(payload));
}

export { fetchGlanceData, pickRelevantRegistration, sendGlanceToWatch };
