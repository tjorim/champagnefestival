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
names use kebab case; unknown icons render empty. Template colours are validated
hex values from the API, covered by a scoped dynamic-style lint exception.
