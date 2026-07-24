// Watch-side (embeddedjs) code — runs natively on the watch via Moddable's
// XS engine, no network access (see ../pkjs/index.js for that).
//
// TODO(verify): the widget/rendering API used below (Text, layout, colors)
// is NOT confirmed against real Alloy documentation or examples — the
// public guide (developer.repebble.com/guides/alloy/) does not publish a
// concrete rendering sample. Treat everything in this file as pseudocode
// until checked against the Moddable Pebble Examples repo (e.g.
// "hellopiu-text") or `pebble new-project --alloy` output.
//
// Intended behavior: show the event title/date and check-in status most
// recently sent from src/pkjs/index.js, or a placeholder if nothing has
// arrived yet (no registrations, or the phone hasn't synced).

const glanceState = {
  eventTitle: null,
  eventDate: null,
  checkedIn: false,
};

function formatGlanceText(state) {
  if (!state.eventTitle) {
    return "No upcoming\nregistration";
  }
  const status = state.checkedIn ? "Checked in" : "Not checked in";
  return `${state.eventTitle}\n${state.eventDate}\n${status}`;
}

// TODO(verify): replace with the real Alloy entry point / widget tree once
// confirmed. This function signature is a placeholder.
function render(state) {
  const text = formatGlanceText(state);
  console.log("[watch] glance:", text);
}

// TODO(verify): replace with the real Alloy API for receiving messages sent
// from src/pkjs/index.js's sendGlanceToWatch().
function onGlanceMessage(payload) {
  glanceState.eventTitle = payload.eventTitle;
  glanceState.eventDate = payload.eventDate;
  glanceState.checkedIn = payload.checkedIn;
  render(glanceState);
}

render(glanceState);

export { formatGlanceText, onGlanceMessage };
