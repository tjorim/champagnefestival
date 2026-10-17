# Venue signage (#1262)

Open `https://champagnefestival.tjor.im/signage/CHANNEL` on every laptop assigned
to that channel, replacing CHANNEL with its published slug. Choose the same
site language on each laptop (select it on the home page before opening signage). The canvas is 1920×1080 and letterboxes to fit.
Press **Start screen** to enter fullscreen and request a screen wake lock.
A small status dot stays visible: green means connected with a recent clock
sample; amber means disconnected or waiting for sync. Slide changes use cuts.

Use current Chromium over HTTPS. For unattended use launch it with
`chromium --kiosk https://champagnefestival.tjor.im/signage/CHANNEL`.
Disable OS sleep, screen blanking and screensavers; connect mains power. If the
wake lock is unavailable or released, the player displays a reminder. Returning
to a visible tab requests the lock again. Fullscreen may require another user
gesture after exiting it; reload and press Start screen again.

Allow one complete online load before disconnecting. The production service
worker saves the shell and same-origin images; the player saves only playlists
whose images have loaded. Private browsing, storage eviction, a first offline
visit, or external image hosts can prevent offline startup. Do not clear browser
storage during the event. Offline playback retains its last clock estimate;
reconnect periodically to correct oscillator drift. Updates are polled every
30 seconds and applied at the current playlist's next cycle boundary. Clock
sampling repeats every three minutes and on return to the tab or network.

## Rehearsal (required before event use)

- [ ] Load the same channel on at least two mains-powered laptops; press Start screen.
- [ ] Verify matching slide indices/changes within one second for several cycles.
- [ ] Deliberately set one laptop's clock several minutes wrong, reload, and verify sync.
- [ ] Publish a revision mid-cycle; verify both screens change at the next cycle boundary.
- [ ] Disconnect networking after preload; verify multiple cycles continue and reload offline.
- [ ] Restore networking; verify green status and corrected sync return.
- [ ] Leave running beyond the OS sleep timeout and verify both screens remain awake.
- [ ] Switch tabs and return; verify wake lock reacquisition and clock refresh.
- [ ] Test an empty channel and unavailable channel; verify the start/status UI remains usable.

## Shared renderer contract

`frontend/src/signage/SlideRenderer.tsx` accepts a public slide and renders its
ordered template layers for both playback and future editor previews. Layer
`x`/`y` place the **top-left** corner in canvas percentages, matching the
[floor-plan convention](floor-plan-coordinates.md); width/height are percentages
of the fixed 1920×1080 stage. Rotation is clockwise about each layer's centre.
Font sizes are stage pixels. Images fit inside their layer; background and image
slides cover the stage. Later layers paint above earlier layers. The `sponsor`
binding renders the translated Sponsor label only for sponsors. Lucide sticker
names come from the shared `frontend/src/signage/icons.ts` catalogue:
`accessibility`, `arrow-left`, `arrow-right`, `ban`, `cigarette-off`, `circle-alert`,
`dog`, `door-open`, `glass-water`, `info`, `map-pin`, `square-parking`,
`triangle-alert`, `utensils`, and `wine`. The editor should use this same list.
Unknown icons render empty; upload an image sticker for other artwork. Named
imports keep the full Lucide catalogue out of the player bundle. Template colours are validated
hex values from the API, covered by a scoped dynamic-style lint exception.

## Cold-start offline exports (#1265)

In **Content → Screen channels**, choose **Download offline bundle** for a saved,
active channel. Export while online; the snapshot includes only slides currently
published and scheduled at export time, with organisations and notice translations
frozen. Unsaved editor drafts are excluded. Keep the tab open until the download
finishes. An empty channel or unavailable image fails the export rather than
producing a partial bundle.

Extract the ZIP completely, copy the same folder to each laptop and open
`index.html` in Chromium, even without an internet connection. No local web server
is needed. `playlist.json` records the frozen revision, epoch, durations and local
PNG filenames; the player embeds that same JSON to avoid local-file fetch limits.
The shared renderer produces the 1920×1080 PNGs used by the bundle. **Download
slide images** produces a ZIP containing just those numbered PNGs for other tools.

Synchronise system clocks before disconnecting; the offline player uses system
time and the original playlist epoch, so clocks accurate within a second give
slide changes within about a second. It cannot correct a wrong clock from the
server. Press **Start screen**, disable OS sleep/blanking and connect mains power;
wake locks may be unavailable for local files. Re-export to refresh content or
schedules. There are no live updates or video exports. Rehearse a cold offline
start on two laptops and several full cycles before relying on the bundle.
