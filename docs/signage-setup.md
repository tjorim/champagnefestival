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
schedules. The bundle has no live updates. For video, see the separate MP4 option below. Rehearse a cold offline
start on two laptops and several full cycles before relying on the bundle.

## One-cycle MP4 exports (#1349)

When video export is configured, **Content → Screen channels → Video exports**
lets an admin select an active published channel and choose **Download video
(MP4)**. It captures the same 1920×1080 PNG renderer, uploads numbered slides,
then queues one silent 30 fps H.264 video. Up to 60 slides and 600 seconds are
allowed. Current organisation content, translations and schedule membership
are frozen at snapshot time; unsaved edits and later schedule changes are
excluded. The playlist starts at its first slide and holds the final slide for
its configured duration; it is one cycle, not a recording of the tab.

Keep the tab open through preparation/upload. Once submitted, encoding continues
without the tab; return to **Your video exports** to find progress, download or
cancel/remove your exports. Preparation has a fixed 45-minute deadline;
abandoned preparations are automatically cancelled and their uploads cleaned
up. You can cancel an interrupted preparation and restart sooner. Temporary encoder outages retry in the background. Failed/expired
jobs require a new export. Downloads expire 24 hours after starting the snapshot.

An MP4 has no server/system-clock synchronisation between screens, live updates
or wake-lock handling. Use the offline HTML bundle when clock-based coordinated
playback is required. Rehearse the MP4 in the venue's actual player before use.
HTML/PNG export and the live/offline players work without the media worker.

Operator activation is separate from installing this code. Apply migration `008`;
configure `MEDIA_WORKER_URL=http://media-worker:8090` and the mounted
`MEDIA_WORKER_TOKEN_FILE`, and mount `SIGNAGE_VIDEO_STORAGE` as a private
persistent volume shared by API replicas (outside static/Caddy roots). The API's
lifespan owns reconciliation; no extra outbox process is required. Provision
private network/token/storage access through apps#273. Follow the worker's
[runbook](https://github.com/tjorim/apps/blob/cbb88ec9f19d1ea3e429ad9e1e7b8679239379ad/docs/media-worker.md)
and verify Travel privacy/output parity, production contention/resources,
private caller access and rollback before enabling signage. Leave the URL blank
until those gates pass. Disabling the URL stops remote work; local expiry cleanup
continues, and existing locally ready downloads remain available until expiry.

For local real-encoder checks, run the apps worker from that commit on a private
loopback URL with synthetic per-app credentials, then set
`MEDIA_WORKER_TEST_URL` and `MEDIA_WORKER_TEST_TOKEN_FILE` when running backend
`pytest tests/test_signage_video.py -k real_worker` and frontend
`playwright test e2e/signage-video.authenticated.spec.ts --project=chromium-admin`.
The browser test feeds actual PNG captures into the worker and inspects the cuts
and final hold in Chromium; the backend test verifies a single-slide encode,
private download and faststart with ffprobe. Normal tests use isolated worker
fixtures and do not require production credentials.
