# Analog Rytm MKII: the base's digital voices — 12 November 2026

The Modwerk base's send-bus variant with the digital voices (`mw_voices`, `ev_sound_applied`), as this pull request vendors it: **3ece243b** (`modwerk-base-analog-rytm-mkii-3ece243b.elemod`, `sdk/machines/analog-rytm-mkii/base-binding.json`), built by `npm run machine:base -- analog-rytm-mkii` with the reviewed toolchain; the plain variant (1c14b6b0) is unchanged.

- **Images:** linked with `scripts/link-image.mjs` on stock OS 1.74 from this branch's vendored base:
  - VC01 `23d1a44c…`: the base + CHORUS (a send effect, no voice installed).
  - VB01 `bca38869…`: the base + BD ANALOG 0.2.0-experimental (the voice machine of the follow-up pull request; module folder not in this branch).
- **Emulator** (rytm-emu `2ac0f1f`): VC01's set boots and runs with no fault (only TRAP #0, as stock); BD ANALOG on 3ece243b passes its `emu_check` (chosen with nothing played, keys leave its label, a tap of B switches 808/909 and plays, meter mean 3.4 %, dearest block 4.6 % of a block).
- **On a unit:** Nathaniel Pavel (@npp1993) on his Analog Rytm MKII, OS 1.74, both images flashed with Transfer, a scratch project, by hand:
  - **VC01 (CHORUS alone):** a track's SEND into CHORUS on SEND FX and its return played; a kit save and reload kept CHORUS, the send and the sound; a sound lock to a pool sound played on its step; after a project save and a power cycle the pattern, the lock, CHORUS and the send came back and played. Nothing off noted.
  - **VB01 (BD ANALOG):** chosen from the BD section of BD's machine list, offered on SD and BT and not on the other tracks; B read TON and the bar 808, a tap gave SWT and 909, a tap back 808, both played. A kit saved with the 909 came back as 909 after the track was tapped to 808 and the kit reloaded. A 909 pool sound locked onto one trig of an 808 track played the 909 on that step, and the label and the bar switched to SWT and 909 while the lock played (`ev_sound_applied` sets the track's type from the applied sound). After a project save and a power cycle the type, the lock and the sound came back.
- **Not run on this build:** the voice's knob sweeps against the host model and the voices-together stress (run on the same voice code on a development base the day before; the follow-up pull request's TESTING.md), CPU load of a send effect beside a voice.
