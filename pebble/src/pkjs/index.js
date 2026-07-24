// Phone-side (pkjs) companion script.
//
// Per Alloy's networking model, watch-side fetch() calls are proxied through
// this phone-side code automatically by @moddable/pebbleproxy — this file
// does not need to implement any request/response logic itself for that part.
// See https://developer.repebble.com/guides/alloy/networking/
//
// The other job of this file is pairing: relaying an OIDC access token from
// the phone's config webview down to the watch, using the classic PebbleKit
// JS configuration flow (showConfiguration / Pebble.openURL / webviewclosed —
// see https://developer.repebble.com/guides/user-interfaces/app-configuration/).
// The watch stores the token (src/embeddedjs/main.js) and uses it as a Bearer
// token against /api/me/registrations. See ../../README.md for the caveat
// that the pairing page's origin needs to be allowlisted as an OIDC redirect
// URI before this works end to end.

const moddableProxy = require("@moddable/pebbleproxy");

const CONFIG_URL = "https://champagnefestival.tjor.im/pebble-pair";

Pebble.addEventListener("ready", moddableProxy.readyReceived);

Pebble.addEventListener("appmessage", function (e) {
  if (moddableProxy.appMessageReceived(e)) return;
});

Pebble.addEventListener("showConfiguration", function () {
  Pebble.openURL(CONFIG_URL);
});

Pebble.addEventListener("webviewclosed", function (e) {
  if (!e.response) return;

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(e.response));
  } catch (err) {
    console.log("pebble-pair: could not parse webview response: " + err);
    return;
  }

  if (!payload.accessToken) return;

  Pebble.sendAppMessage(
    { AUTH_TOKEN: payload.accessToken },
    function () {
      console.log("pebble-pair: token relayed to watch");
    },
    function () {
      console.log("pebble-pair: failed to relay token to watch");
    },
  );
});
